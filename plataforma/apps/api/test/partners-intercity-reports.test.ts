import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNetwork, createTestApp, type TestApp } from "./helpers.ts";

let t: TestApp;
let admin: string;
let finance: string;
let net: Awaited<ReturnType<typeof createNetwork>>;

const ok = <T>(res: { status: number; body: T }, expected = 201): T => {
  if (res.status !== expected) throw new Error(`esperado ${expected}, obtido ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
};

async function createPlan(intercity: { intercityModel: string; intercityCredits?: number; intercityDiscountPct?: number }) {
  return ok(
    await t.call<any>("POST", "/admin/plans", finance, {
      name: `Plano ${randomUUID().slice(0, 6)}`,
      priceKz: 30000,
      periodDays: 30,
      requiresBooking: true,
      maxBookingsPerDay: 4,
      intercityDiscountPct: 0,
      intercityCredits: 0,
      active: true,
      ...intercity,
    }),
  ).id as string;
}

/** Estudante verificado com subscrição activa (pagamento confirmado pelo financeiro). */
async function subscribedStudent(planId: string) {
  const email = `est.${randomUUID().slice(0, 8)}@teste.ao`;
  const id = await t.createUser("student", email, { verifiedUniversityId: net.uni.id });
  const token = await t.login(email);
  const sub = ok(await t.call<any>("POST", "/subscriptions", token, { planId }));
  const pay = ok(await t.call<any>("POST", "/payments", token, { subscriptionId: sub.id, method: "bank_transfer", idempotencyKey: randomUUID() }));
  ok(await t.call("POST", `/payments/${pay.id}/receipt`, token, { reference: `TRF-${randomUUID().slice(0, 8)}` }), 200);
  ok(await t.call("POST", `/admin/payments/${pay.id}/confirm`, finance, {}), 200);
  return { id, token };
}

/** Rota intercidades activa (sem universidade) com três paragens, horário diário e uma viagem por data pedida. */
async function createIntercityRoute(dates: string[]) {
  const stop = async (name: string, lat: number) =>
    ok(await t.call<any>("POST", "/admin/stops", admin, { name, city: name, lat, lng: 13.4, kind: "pickup" })).id as string;
  const [a, b, c] = [await stop("Luanda Terminal", -8.83), await stop("Sumbe", -11.2), await stop("Benguela", -12.57)];
  const route = ok(await t.call<any>("POST", "/admin/routes", admin, { code: `IC${Math.floor(Math.random() * 1e6)}`, name: "Luanda → Benguela", direction: "to_university", serviceType: "intercity" }));
  ok(await t.call("PUT", `/admin/routes/${route.id}/stops`, admin, { stops: [{ stopId: a, minutesFromStart: 0 }, { stopId: b, minutesFromStart: 240 }, { stopId: c, minutesFromStart: 420 }] }), 200);
  const schedule = ok(await t.call<any>("POST", `/admin/routes/${route.id}/schedules`, admin, { departureTime: "20:00", daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }));
  ok(await t.call("PATCH", `/admin/routes/${route.id}`, admin, { status: "active" }), 200);
  const trips: string[] = [];
  for (const serviceDate of dates) {
    trips.push(ok(await t.call<any>("POST", "/admin/trips", admin, { routeId: route.id, scheduleId: schedule.id, serviceDate, vehicleId: net.vehicle.id, driverId: net.driver.id })).id);
  }
  return { route, stops: { a, b, c }, trips };
}

beforeAll(async () => {
  t = await createTestApp();
  await t.createUser("super_admin", "admin.f4@teste.ao");
  await t.createUser("finance", "financeiro.f4@teste.ao");
  admin = await t.login("admin.f4@teste.ao");
  finance = await t.login("financeiro.f4@teste.ao");
  net = await createNetwork(t, admin);
});
afterAll(async () => {
  await t.close();
});

describe("Intercidades", () => {
  it("só são abrangidas por planos com viagens incluídas e nunca acima do limite do período", async () => {
    const ic = await createIntercityRoute(["2026-11-03", "2026-11-04"]);
    const routes = ok(await t.call<any[]>("GET", "/routes?serviceType=intercity"), 200);
    expect(routes.map((r) => r.id)).toContain(ic.route.id);

    const without = await subscribedStudent(await createPlan({ intercityModel: "none" }));
    const refused = await t.call<any>("POST", "/bookings", without.token, { tripId: ic.trips[0], stopId: ic.stops.a });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain("não inclui viagens intercidades");

    const discount = await subscribedStudent(await createPlan({ intercityModel: "discount", intercityDiscountPct: 20 }));
    const notSold = await t.call<any>("POST", "/bookings", discount.token, { tripId: ic.trips[0], stopId: ic.stops.a });
    expect(notSold.status).toBe(403);
    expect(notSold.body.error.message).toContain("avulsos");

    const withOne = await subscribedStudent(await createPlan({ intercityModel: "included", intercityCredits: 1 }));
    expect((await t.call<any>("POST", "/bookings", withOne.token, { tripId: ic.trips[0], stopId: ic.stops.c })).status).toBe(400);
    ok(await t.call("POST", "/bookings", withOne.token, { tripId: ic.trips[0], stopId: ic.stops.a }));
    const second = await t.call<any>("POST", "/bookings", withOne.token, { tripId: ic.trips[1], stopId: ic.stops.b });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("intercity_limit");

    // Um plano intercidades não dá acesso a rotas universitárias de outra universidade, nem o contrário.
    const uniRoute = await t.call<any>("POST", "/bookings", withOne.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(uniRoute.status).toBe(201);
  });

  it("uma rota intercidades activa não pode passar a universitária sem universidade associada", async () => {
    const ic = await createIntercityRoute([]);
    const res = await t.call<any>("PATCH", `/admin/routes/${ic.route.id}`, admin, { serviceType: "university" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("universidade");
  });
});

describe("Transportadoras parceiras", () => {
  it("o validador só valida passes em viagens com veículos da sua transportadora activa", async () => {
    const operatorEmail = `op.${randomUUID().slice(0, 6)}@teste.ao`;
    await t.createUser("transport_operator", operatorEmail);
    const opToken = await t.login(operatorEmail);
    expect((await t.call("POST", "/admin/partners", opToken, { name: "Sem permissão" })).status).toBe(403);

    const carrier = ok(await t.call<any>("POST", "/admin/partners", admin, { name: "Transportadora de Testes", nif: "500000000" }));
    expect(carrier.isDemo).toBe(false);
    const other = ok(await t.call<any>("POST", "/admin/partners", admin, { name: "Outra Transportadora de Testes" }));

    const missingScope = await t.call<any>("POST", "/admin/staff", admin, {
      fullName: "Validador Sem Parceiro",
      email: "validador.sem@teste.ao",
      role: "partner_validator",
      temporaryPassword: "senha-temporaria-1",
    });
    expect(missingScope.status).toBe(400);
    expect(missingScope.body.error.details.fields.carrierIds).toBeDefined();

    const validator = ok(
      await t.call<any>("POST", "/admin/staff", admin, {
        fullName: "Validador Parceiro",
        email: "validador.parceiro@teste.ao",
        role: "partner_validator",
        temporaryPassword: "senha-temporaria-1",
        carrierIds: [carrier.id],
      }),
    );
    expect(validator.carriers.map((c: any) => c.id)).toEqual([carrier.id]);

    // Viagem de hoje em curso, com um veículo da transportadora; outra em curso com veículo próprio.
    const partnerVehicle = ok(await t.call<any>("POST", "/admin/vehicles", admin, { plate: `PV-${Math.floor(Math.random() * 1e6)}`, model: "Autocarro parceiro", capacity: 30, carrierId: carrier.id }));
    const partnerList = ok(await t.call<any[]>("GET", "/admin/partners", admin), 200);
    expect(partnerList.find((p) => p.id === carrier.id)).toMatchObject({ vehicleCount: 1, validatorCount: 1 });
    expect(partnerList.find((p) => p.id === other.id)).toMatchObject({ vehicleCount: 0, validatorCount: 0 });
    const partnerNet = await createNetwork(t, admin);
    ok(await t.call("PATCH", `/admin/trips/${partnerNet.trip.id}`, admin, { vehicleId: partnerVehicle.id }), 200);
    t.clock.now = new Date("2026-11-02T17:30:00+01:00");
    for (const n of [net, partnerNet]) {
      const driverToken = await t.login(n.driverEmail, n.driverPassword);
      ok(await t.call("POST", `/driver/trips/${n.trip.id}/start`, driverToken), 200);
    }

    const vToken = await t.login("validador.parceiro@teste.ao", "senha-temporaria-1");
    const listed = ok(await t.call<any[]>("GET", "/validator/trips", vToken), 200);
    expect(listed.map((x) => x.id)).toEqual([partnerNet.trip.id]);

    const student = await subscribedStudent(await createPlan({ intercityModel: "none" }));
    const qr = ok(await t.call<any>("GET", "/passes/me/token", student.token), 200);
    expect((await t.call("POST", "/passes/validate", vToken, { token: qr.token, tripId: net.trip.id })).status).toBe(404);
    const inScope = ok(await t.call<any>("POST", "/passes/validate", vToken, { token: qr.token, tripId: partnerNet.trip.id }), 200);
    // O estudante pertence à universidade da primeira rede, não à da rede do parceiro.
    expect(inScope.result).toBe("not_covered");

    ok(await t.call("PATCH", `/admin/partners/${carrier.id}`, admin, { active: false }), 200);
    expect(ok(await t.call<any[]>("GET", "/validator/trips", vToken), 200)).toEqual([]);
    expect(other.id).not.toBe(carrier.id);
  });
});

describe("Relatórios", () => {
  it("mostram ocupação por rota e escondem valores financeiros a quem não os pode ver", async () => {
    const report = ok(await t.call<any>("GET", "/admin/reports?from=2026-11-01&to=2026-11-30", admin), 200);
    const row = report.occupancy.find((r: any) => r.routeId === net.route.id);
    expect(row.trips).toBe(1);
    expect(row.seats).toBe(20);
    expect(row.confirmed + row.boarded).toBeGreaterThanOrEqual(1);
    expect(report.payments).not.toBeNull();

    const managerEmail = `gestor.${randomUUID().slice(0, 6)}@teste.ao`;
    await t.createUser("university_manager", managerEmail, { universityIds: [net.uni.id] });
    const manager = ok(await t.call<any>("GET", "/admin/reports", await t.login(managerEmail)), 200);
    expect(manager.payments).toBeNull();

    const driverToken = await t.login(net.driverEmail, net.driverPassword);
    expect((await t.call("GET", "/admin/reports", driverToken)).status).toBe(403);
    expect((await t.call("GET", "/admin/reports?from=2026-12-01&to=2026-11-01", admin)).status).toBe(400);
  });
});
