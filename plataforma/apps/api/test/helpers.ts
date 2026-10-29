import type { FastifyInstance } from "fastify";
import type { Role } from "@uni/shared";
import { buildApp } from "../src/app.ts";
import { hashPassword } from "../src/auth/crypto.ts";
import { openDatabase, type DbHandle } from "../src/db/client.ts";
import { drivers, studentProfiles, universityManagers, users } from "../src/db/schema.ts";
import { loadEnv } from "../src/env.ts";
import { localDate } from "../src/lib.ts";
import { createPaymentProviders } from "../src/payments/providers.ts";

export const PASSWORD = "palavra-passe-de-teste";

export interface TestApp {
  app: FastifyInstance;
  handle: DbHandle;
  clock: { now: Date };
  today: () => string;
  close: () => Promise<void>;
  /** Cria um utilizador directamente na base (sem passar pela API) e devolve o id. */
  createUser: (role: Role, email: string, extra?: { universityIds?: string[]; verifiedUniversityId?: string }) => Promise<string>;
  login: (email: string, password?: string) => Promise<string>;
  call: <T = any>(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, token?: string, body?: unknown) => Promise<{ status: number; body: T }>;
}

export async function createTestApp(
  options: { databaseUrl?: string; now?: Date; env?: Record<string, string> } = {},
): Promise<TestApp> {
  const env = loadEnv({
    NODE_ENV: "test",
    DATABASE_URL: options.databaseUrl ?? "pglite:memory",
    JWT_SECRET: "segredo-de-testes-jwt-com-mais-de-32-caracteres",
    PASS_TOKEN_SECRET: "segredo-de-testes-passe-com-mais-de-32-caracteres",
    PAYMENTS_SANDBOX_ENABLED: "true",
    BANK_TRANSFER_IBAN: "AO06.0000.0000.0000.0000.0000.0 (TESTE)",
    BANK_TRANSFER_BENEFICIARY: "Beneficiário de testes",
    DEV_EXPOSE_RESET_CODES: "true",
    AUTH_RATE_LIMIT_PER_MINUTE: "10000",
    ...options.env,
  });
  const handle = await openDatabase(env.DATABASE_URL);
  // Segunda-feira, 08:00 em Luanda (UTC+1).
  const clock = { now: options.now ?? new Date("2026-11-02T08:00:00+01:00") };
  const app = await buildApp({ db: handle.db, env, payments: createPaymentProviders(env), now: () => clock.now });
  const passwordHash = await hashPassword(PASSWORD);

  const call: TestApp["call"] = async (method, url, token, body) => {
    const res = await app.inject({
      method,
      url: `/api/v1${url}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      ...(body !== undefined ? { payload: body as object } : {}),
    });
    return { status: res.statusCode, body: (res.body ? res.json() : undefined) as never };
  };

  return {
    app,
    handle,
    clock,
    today: () => localDate(clock.now),
    close: async () => {
      await app.close();
      await handle.close();
    },
    createUser: async (role, email, extra = {}) => {
      const [user] = await handle.db
        .insert(users)
        .values({ email, fullName: `Utilizador ${email.split("@")[0]} Teste`, role, passwordHash })
        .returning({ id: users.id });
      const id = user!.id;
      if (role === "student") {
        await handle.db.insert(studentProfiles).values({
          userId: id,
          universityId: extra.verifiedUniversityId ?? null,
          verificationStatus: extra.verifiedUniversityId ? "approved" : "not_submitted",
        });
      }
      if (role === "driver") await handle.db.insert(drivers).values({ userId: id, licenceNumber: `CARTA-${id.slice(0, 8)}` });
      if (role === "university_manager" && extra.universityIds) {
        await handle.db.insert(universityManagers).values(extra.universityIds.map((universityId) => ({ userId: id, universityId })));
      }
      return id;
    },
    login: async (email, password = PASSWORD) => {
      const res = await call<{ accessToken: string }>("POST", "/auth/login", undefined, { email, password });
      if (res.status !== 200) throw new Error(`login falhou para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.accessToken;
    },
    call,
  };
}

/**
 * Cria pela API administrativa uma rede mínima e operacional: universidade, paragens, rota activa com
 * horário diário, veículo, motorista e uma viagem para a data indicada.
 */
export async function createNetwork(t: TestApp, adminToken: string, options: { capacity?: number; date?: string } = {}) {
  const ok = <T>(res: { status: number; body: T }, expected = 201): T => {
    if (res.status !== expected) throw new Error(`esperado ${expected}, obtido ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
  };
  const uni = ok(await t.call<any>("POST", "/admin/universities", adminToken, { name: "Universidade de Testes", shortName: `UT${Math.floor(Math.random() * 1e6)}`, city: "Luanda" }));
  const pickup = ok(await t.call<any>("POST", "/admin/stops", adminToken, { name: "Paragem Teste", city: "Luanda", lat: -8.9, lng: 13.3, kind: "pickup" }));
  const campus = ok(await t.call<any>("POST", "/admin/stops", adminToken, { name: "Campus Teste", city: "Luanda", lat: -8.92, lng: 13.19, kind: "destination", universityId: uni.id }));
  const route = ok(await t.call<any>("POST", "/admin/routes", adminToken, { code: `R${Math.floor(Math.random() * 1e6)}`, name: "Rota de testes", direction: "to_university", universityIds: [uni.id] }));
  ok(await t.call("PUT", `/admin/routes/${route.id}/stops`, adminToken, { stops: [{ stopId: pickup.id, minutesFromStart: 0 }, { stopId: campus.id, minutesFromStart: 30 }] }), 200);
  const schedule = ok(await t.call<any>("POST", `/admin/routes/${route.id}/schedules`, adminToken, { departureTime: "18:00", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }));
  ok(await t.call("PATCH", `/admin/routes/${route.id}`, adminToken, { status: "active" }), 200);
  const vehicle = ok(await t.call<any>("POST", "/admin/vehicles", adminToken, { plate: `LD-${Math.floor(Math.random() * 1e6)}`, model: "Autocarro de testes", capacity: options.capacity ?? 20 }));
  const driverEmail = `motorista.${Math.floor(Math.random() * 1e9)}@teste.ao`;
  const driver = ok(await t.call<any>("POST", "/admin/drivers", adminToken, { fullName: "Motorista de Testes", email: driverEmail, temporaryPassword: "senha-temporaria-1", licenceNumber: `LIC${Math.floor(Math.random() * 1e6)}` }));
  const trip = ok(await t.call<any>("POST", "/admin/trips", adminToken, { routeId: route.id, scheduleId: schedule.id, serviceDate: options.date ?? t.today(), vehicleId: vehicle.id, driverId: driver.id }));
  return { uni, pickup, campus, route, schedule, vehicle, driver, driverEmail, driverPassword: "senha-temporaria-1", trip };
}
