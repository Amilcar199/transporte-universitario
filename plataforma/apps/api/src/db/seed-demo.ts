/**
 * Dados de DEMONSTRAÇÃO. Todos os registos ficam com `is_demo = true` e servem apenas para explorar a
 * plataforma localmente. As universidades existem, mas as coordenadas são aproximadas e as rotas,
 * paragens, horários, veículos, motoristas, planos e preços são fictícios.
 *
 * A palavra-passe das contas de demonstração vem de SEED_DEMO_PASSWORD ou é gerada aleatoriamente e
 * mostrada uma única vez no terminal.
 */
import { eq } from "drizzle-orm";
import { hashPassword, randomToken } from "../auth/crypto.ts";
import { loadEnv } from "../env.ts";
import { addDays, isoWeekday, localDate } from "../lib.ts";
import { openDatabase } from "./client.ts";
import {
  drivers,
  plans,
  routes,
  routeStops,
  routeUniversities,
  schedules,
  stops,
  studentProfiles,
  trips,
  universities,
  universityManagers,
  users,
  vehicles,
} from "./schema.ts";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Os dados de demonstração não podem ser carregados em produção.");

const DEMO_DOMAIN = "demo.unirota.invalid";
const handle = await openDatabase(env.DATABASE_URL);
const db = handle.db;

const [already] = await db.select({ id: users.id }).from(users).where(eq(users.email, `admin@${DEMO_DOMAIN}`));
if (already) {
  console.log("Os dados de demonstração já foram carregados. Nada a fazer.");
  await handle.close();
  process.exit(0);
}

const password = process.env.SEED_DEMO_PASSWORD ?? `Demo-${randomToken(9)}`;
const passwordHash = await hashPassword(password);
const today = localDate(new Date());

await db.transaction(async (tx) => {
  const [uor, isptec, uan] = await tx
    .insert(universities)
    .values([
      { name: "Universidade Óscar Ribas", shortName: "UÓR", city: "Luanda", address: "Talatona (aproximado)", lat: -8.9145, lng: 13.1856, isDemo: true },
      { name: "Instituto Superior Politécnico de Tecnologias e Ciências", shortName: "ISPTEC", city: "Luanda", address: "Talatona (aproximado)", lat: -8.9208, lng: 13.1931, isDemo: true },
      { name: "Universidade Agostinho Neto", shortName: "UAN", city: "Luanda", address: "Camama (aproximado)", lat: -8.9306, lng: 13.2202, isDemo: true },
    ])
    .returning();

  const stopRows = await tx
    .insert(stops)
    .values([
      { name: "Viana — Estalagem", neighbourhood: "Estalagem", landmark: "Junto ao mercado (demo)", city: "Luanda", lat: -8.9012, lng: 13.3654, isDemo: true },
      { name: "Zango 0", neighbourhood: "Zango", landmark: "Paragem principal (demo)", city: "Luanda", lat: -8.9386, lng: 13.3926, isDemo: true },
      { name: "Kilamba — Bloco Q", neighbourhood: "Kilamba", landmark: "Rotunda (demo)", city: "Luanda", lat: -8.9958, lng: 13.2731, isDemo: true },
      { name: "Benfica — Mercado", neighbourhood: "Benfica", landmark: "Entrada do mercado (demo)", city: "Luanda", lat: -8.9631, lng: 13.1832, isDemo: true },
      { name: "Campus UÓR", city: "Luanda", lat: -8.9145, lng: 13.1856, kind: "destination", universityId: uor!.id, isDemo: true },
      { name: "Campus ISPTEC", city: "Luanda", lat: -8.9208, lng: 13.1931, kind: "destination", universityId: isptec!.id, isDemo: true },
      { name: "Campus UAN — Camama", city: "Luanda", lat: -8.9306, lng: 13.2202, kind: "destination", universityId: uan!.id, isDemo: true },
    ])
    .returning();
  const [viana, zango, kilamba, benfica, campusUor, campusIsptec, campusUan] = stopRows;

  const [r1, r2] = await tx
    .insert(routes)
    .values([
      { code: "VIA-TAL", name: "Viana → Talatona (UÓR / ISPTEC)", direction: "to_university", status: "active", isDemo: true },
      { code: "KIL-UAN", name: "Kilamba → UAN Camama", direction: "to_university", status: "active", isDemo: true },
    ])
    .returning();
  await tx.insert(routeUniversities).values([
    { routeId: r1!.id, universityId: uor!.id },
    { routeId: r1!.id, universityId: isptec!.id },
    { routeId: r2!.id, universityId: uan!.id },
  ]);
  await tx.insert(routeStops).values([
    { routeId: r1!.id, stopId: zango!.id, position: 1, minutesFromStart: 0 },
    { routeId: r1!.id, stopId: viana!.id, position: 2, minutesFromStart: 15 },
    { routeId: r1!.id, stopId: benfica!.id, position: 3, minutesFromStart: 45 },
    { routeId: r1!.id, stopId: campusIsptec!.id, position: 4, minutesFromStart: 60 },
    { routeId: r1!.id, stopId: campusUor!.id, position: 5, minutesFromStart: 65 },
    { routeId: r2!.id, stopId: kilamba!.id, position: 1, minutesFromStart: 0 },
    { routeId: r2!.id, stopId: campusUan!.id, position: 2, minutesFromStart: 25 },
  ]);
  const weekdays = [1, 2, 3, 4, 5];
  const [s1, s2] = await tx
    .insert(schedules)
    .values([
      { routeId: r1!.id, departureTime: "06:00", daysOfWeek: weekdays },
      { routeId: r2!.id, departureTime: "06:30", daysOfWeek: weekdays },
    ])
    .returning();

  const [v1, v2] = await tx
    .insert(vehicles)
    .values([
      { plate: "LD-00-01-DM", model: "Toyota Coaster (demo)", capacity: 29, isDemo: true },
      { plate: "LD-00-02-DM", model: "Hiace (demo)", capacity: 14, isDemo: true },
    ])
    .returning();

  const people = await tx
    .insert(users)
    .values([
      { email: `admin@${DEMO_DOMAIN}`, fullName: "Administrador Demo", role: "super_admin", passwordHash, isDemo: true },
      { email: `operador@${DEMO_DOMAIN}`, fullName: "Operador Demo", role: "transport_operator", passwordHash, isDemo: true },
      { email: `gestor.uor@${DEMO_DOMAIN}`, fullName: "Gestor UÓR Demo", role: "university_manager", passwordHash, isDemo: true },
      { email: `financeiro@${DEMO_DOMAIN}`, fullName: "Financeiro Demo", role: "finance", passwordHash, isDemo: true },
      { email: `motorista1@${DEMO_DOMAIN}`, fullName: "Motorista Um Demo", role: "driver", passwordHash, isDemo: true },
      { email: `motorista2@${DEMO_DOMAIN}`, fullName: "Motorista Dois Demo", role: "driver", passwordHash, isDemo: true },
      { email: `estudante@${DEMO_DOMAIN}`, fullName: "Estudante Verificada Demo", role: "student", passwordHash, isDemo: true },
      { email: `novo.estudante@${DEMO_DOMAIN}`, fullName: "Estudante Por Verificar Demo", role: "student", passwordHash, isDemo: true },
    ])
    .returning({ id: users.id, email: users.email });
  const byEmail = (prefix: string) => people.find((p) => p.email === `${prefix}@${DEMO_DOMAIN}`)!.id;

  await tx.insert(universityManagers).values({ userId: byEmail("gestor.uor"), universityId: uor!.id });
  await tx.insert(drivers).values([
    { userId: byEmail("motorista1"), licenceNumber: "DEMO-0001", defaultVehicleId: v1!.id },
    { userId: byEmail("motorista2"), licenceNumber: "DEMO-0002", defaultVehicleId: v2!.id },
  ]);
  // A estudante verificada tem a inscrição aprovada mas NÃO tem subscrição paga: o pagamento faz-se pela app.
  await tx.insert(studentProfiles).values([
    { userId: byEmail("estudante"), universityId: uor!.id, studentNumber: "DEMO-2026-001", verificationStatus: "approved" },
    { userId: byEmail("novo.estudante"), universityId: null, verificationStatus: "not_submitted" },
  ]);

  await tx.insert(plans).values([
    { name: "Mensal (demo)", description: "Ida e volta em dias úteis. Preço fictício.", priceKz: 25_000, periodDays: 30, maxBookingsPerDay: 2, isDemo: true },
    {
      name: "Mensal + Intercidades (demo)",
      description: "Inclui 2 viagens intercidades por mês. Preço fictício.",
      priceKz: 32_000,
      periodDays: 30,
      maxBookingsPerDay: 2,
      intercityModel: "credits",
      intercityCredits: 2,
      isDemo: true,
    },
  ]);

  const tripRows = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    if (!weekdays.includes(isoWeekday(date))) continue;
    tripRows.push(
      { routeId: r1!.id, scheduleId: s1!.id, serviceDate: date, departureTime: s1!.departureTime, vehicleId: v1!.id, driverId: byEmail("motorista1"), capacity: v1!.capacity },
      { routeId: r2!.id, scheduleId: s2!.id, serviceDate: date, departureTime: s2!.departureTime, vehicleId: v2!.id, driverId: byEmail("motorista2"), capacity: v2!.capacity },
    );
  }
  if (tripRows.length > 0) await tx.insert(trips).values(tripRows);
});

console.log("Dados de demonstração carregados (todos marcados como demonstração).");
console.log(`Contas: admin, operador, gestor.uor, financeiro, motorista1, motorista2, estudante, novo.estudante @${DEMO_DOMAIN}`);
if (!process.env.SEED_DEMO_PASSWORD) console.log(`Palavra-passe gerada para as contas de demonstração (mostrada só agora): ${password}`);
await handle.close();
