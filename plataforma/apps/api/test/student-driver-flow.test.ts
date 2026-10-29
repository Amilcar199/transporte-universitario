import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { notifications, passes } from "../src/db/schema.ts";
import { createNetwork, createTestApp, type TestApp } from "./helpers.ts";

let t: TestApp;
let admin: string;
let finance: string;
let net: Awaited<ReturnType<typeof createNetwork>>;
let planId: string;

/** Estudante verificado com subscrição activa paga por transferência e confirmada pelo financeiro. */
async function subscribedStudent(email: string): Promise<{ id: string; token: string }> {
  const id = await t.createUser("student", email, { verifiedUniversityId: net.uni.id });
  const token = await t.login(email);
  const sub = await t.call<any>("POST", "/subscriptions", token, { planId });
  expect(sub.status).toBe(201);
  const pay = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "bank_transfer", idempotencyKey: randomUUID() });
  expect(pay.status).toBe(201);
  expect((await t.call("POST", `/payments/${pay.body.id}/receipt`, token, { reference: `TRF-${randomUUID().slice(0, 8)}` })).status).toBe(200);
  expect((await t.call("POST", `/admin/payments/${pay.body.id}/confirm`, finance, {})).status).toBe(200);
  return { id, token };
}

beforeAll(async () => {
  t = await createTestApp();
  await t.createUser("super_admin", "admin.fluxo@teste.ao");
  await t.createUser("finance", "financeiro.fluxo@teste.ao");
  admin = await t.login("admin.fluxo@teste.ao");
  finance = await t.login("financeiro.fluxo@teste.ao");
  net = await createNetwork(t, admin, { capacity: 2 });
  const plan = await t.call<any>("POST", "/admin/plans", finance, {
    name: "Mensal de testes",
    priceKz: 25000,
    periodDays: 30,
    requiresBooking: true,
    maxBookingsPerDay: 2,
    intercityModel: "none",
    intercityDiscountPct: 0,
    intercityCredits: 0,
    active: true,
  });
  expect(plan.status).toBe(201);
  planId = plan.body.id;
});
afterAll(async () => {
  await t.close();
});

describe("planos", () => {
  it("não permite planos com intercidades ilimitadas", async () => {
    const res = await t.call<any>("POST", "/admin/plans", finance, {
      name: "Ilimitado",
      priceKz: 30000,
      periodDays: 30,
      requiresBooking: true,
      maxBookingsPerDay: 2,
      intercityModel: "included",
      intercityDiscountPct: 0,
      intercityCredits: 0,
      active: true,
    });
    expect(res.status).toBe(400);
  });
});

describe("catálogo do estudante", () => {
  it("lista rotas, paragens e viagens com lugares disponíveis", async () => {
    const routes = await t.call<any>("GET", `/routes?universityId=${net.uni.id}`);
    expect(routes.body.map((r: any) => r.id)).toContain(net.route.id);
    const stopsNear = await t.call<any>("GET", `/stops/search?universityId=${net.uni.id}&lat=-8.9&lng=13.3`);
    expect(stopsNear.body[0].id).toBe(net.pickup.id);
    expect(stopsNear.body[0].distanceMeters).toBe(0);
    const trips = await t.call<any>("GET", `/routes/${net.route.id}/trips?date=${t.today()}`);
    expect(trips.body).toEqual([expect.objectContaining({ id: net.trip.id, seatsAvailable: 2 })]);
  });
});

describe("pagamentos", () => {
  it("exige confirmação do servidor, é idempotente e emite um único passe", async () => {
    const id = await t.createUser("student", "pagador@teste.ao", { verifiedUniversityId: net.uni.id });
    const token = await t.login("pagador@teste.ao");
    const sub = await t.call<any>("POST", "/subscriptions", token, { planId });
    expect(sub.body.status).toBe("pending_payment");
    expect((await t.call("POST", "/subscriptions", token, { planId })).status).toBe(409);

    const unavailable = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "multicaixa_express", idempotencyKey: randomUUID() });
    expect(unavailable.status).toBe(400);

    const key = randomUUID();
    const p1 = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "bank_transfer", idempotencyKey: key });
    const p2 = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "bank_transfer", idempotencyKey: key });
    expect(p1.status).toBe(201);
    expect(p2.status).toBe(200);
    expect(p2.body.id).toBe(p1.body.id);
    expect(p1.body.amountKz).toBe(25000);
    expect(p1.body.instructions.iban).toContain("TESTE");

    // Enviar o comprovativo não activa a subscrição.
    await t.call("POST", `/payments/${p1.body.id}/receipt`, token, { reference: "TRF-0001" });
    const before = await t.call<any>("GET", "/subscriptions/me", token);
    expect(before.body[0].status).toBe("pending_payment");
    expect((await t.call("POST", `/admin/payments/${p1.body.id}/confirm`, token, {})).status).toBe(403);

    const c1 = await t.call<any>("POST", `/admin/payments/${p1.body.id}/confirm`, finance, {});
    const c2 = await t.call<any>("POST", `/admin/payments/${p1.body.id}/confirm`, finance, {});
    expect(c1.body.outcome).toBe("confirmed");
    expect(c2.body.outcome).toBe("already_confirmed");

    const after = await t.call<any>("GET", "/subscriptions/me", token);
    expect(after.body[0]).toMatchObject({ status: "active", startDate: "2026-11-02", endDate: "2026-12-01" });
    const issued = await t.handle.db.select().from(passes).where(eq(passes.studentId, id));
    expect(issued).toHaveLength(1);
    const notes = await t.handle.db.select().from(notifications).where(eq(notifications.userId, id));
    expect(notes.filter((n) => n.kind === "payment_confirmed")).toHaveLength(1);

    const reused = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "sandbox", idempotencyKey: key });
    expect(reused.status).toBe(409);
  });

  it("o evento do ambiente de testes é processado uma única vez", async () => {
    await t.createUser("student", "sandbox@teste.ao", { verifiedUniversityId: net.uni.id });
    const token = await t.login("sandbox@teste.ao");
    const sub = await t.call<any>("POST", "/subscriptions", token, { planId });
    const pay = await t.call<any>("POST", "/payments", token, { subscriptionId: sub.body.id, method: "sandbox", idempotencyKey: randomUUID() });
    const first = await t.call<any>("POST", `/payments/${pay.body.id}/sandbox/complete`, token, { outcome: "success" });
    const second = await t.call<any>("POST", `/payments/${pay.body.id}/sandbox/complete`, token, { outcome: "success" });
    expect(first.body).toMatchObject({ status: "confirmed", duplicateEvent: false });
    expect(second.body).toMatchObject({ status: "confirmed", duplicateEvent: true });
  });

  it("não aceita subscrições de estudantes sem verificação aprovada", async () => {
    await t.createUser("student", "sem.verificacao@teste.ao");
    const token = await t.login("sem.verificacao@teste.ao");
    expect((await t.call("POST", "/subscriptions", token, { planId })).status).toBe(403);
  });
});

describe("reservas e operação do motorista", () => {
  it("controla capacidade, duplicados e requisitos no servidor", async () => {
    const a = await subscribedStudent("lugar.a@teste.ao");
    const b = await subscribedStudent("lugar.b@teste.ao");
    const c = await subscribedStudent("lugar.c@teste.ao");

    const toCampus = await t.call<any>("POST", "/bookings", a.token, { tripId: net.trip.id, stopId: net.campus.id });
    expect(toCampus.status).toBe(400);

    const ra = await t.call<any>("POST", "/bookings", a.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(ra.status).toBe(201);
    expect(ra.body.seatNumber).toBe(1);
    const dup = await t.call<any>("POST", "/bookings", a.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(dup.status).toBe(409);
    const rb = await t.call<any>("POST", "/bookings", b.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(rb.body.seatNumber).toBe(2);
    const full = await t.call<any>("POST", "/bookings", c.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("trip_full");

    // Cancelar liberta o lugar, que volta a ser atribuído.
    expect((await t.call("POST", `/bookings/${rb.body.id}/cancel`, b.token)).status).toBe(200);
    const rc = await t.call<any>("POST", "/bookings", c.token, { tripId: net.trip.id, stopId: net.pickup.id });
    expect(rc.status).toBe(201);
    expect(rc.body.seatNumber).toBe(2);
    expect((await t.call("POST", `/bookings/${rb.body.id}/cancel`, a.token)).status).toBe(404);

    await t.createUser("student", "nao.subscrito@teste.ao", { verifiedUniversityId: net.uni.id });
    const ns = await t.login("nao.subscrito@teste.ao");
    expect((await t.call("POST", "/bookings", ns, { tripId: net.trip.id, stopId: net.pickup.id })).status).toBe(403);
  });

  it("o motorista inicia e termina apenas a sua viagem; o GPS só é aceite durante a viagem", async () => {
    const driver = await t.login(net.driverEmail, net.driverPassword);
    await t.createUser("driver", "outro.motorista@teste.ao");
    const other = await t.login("outro.motorista@teste.ao");
    const student = (await t.call<any>("GET", "/admin/trips/" + net.trip.id, admin)).body.manifest[0];
    expect(student.studentName).toBeTruthy();

    const manifest = await t.call<any>("GET", `/driver/trips/${net.trip.id}`, driver);
    expect(manifest.status).toBe(200);
    expect(manifest.body.manifest.length).toBe(2);
    const raw = JSON.stringify(manifest.body.manifest);
    expect(raw).not.toContain("@teste.ao");
    expect(raw).not.toContain("amountKz");

    expect((await t.call("GET", `/driver/trips/${net.trip.id}`, other)).status).toBe(403);
    const point = { lat: -8.9, lng: 13.3, recordedAt: t.clock.now.toISOString() };
    expect((await t.call("POST", `/driver/trips/${net.trip.id}/locations`, driver, { points: [point] })).status).toBe(400);

    const tooEarly = await t.call<any>("POST", `/driver/trips/${net.trip.id}/start`, driver);
    expect(tooEarly.status).toBe(400);

    t.clock.now = new Date("2026-11-02T17:30:00+01:00");
    expect((await t.call("POST", `/driver/trips/${net.trip.id}/start`, other)).status).toBe(403);
    const started = await t.call<any>("POST", `/driver/trips/${net.trip.id}/start`, driver);
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("in_progress");

    const gps = await t.call<any>("POST", `/driver/trips/${net.trip.id}/locations`, driver, {
      points: [
        { lat: -8.905, lng: 13.31, speedMps: 10, recordedAt: t.clock.now.toISOString() },
        { lat: -8.9, lng: 13.3, recordedAt: "2026-11-01T10:00:00Z" },
      ],
    });
    expect(gps.body).toEqual({ accepted: 1, rejected: 1 });

    const passengers = await t.call<any>("GET", "/admin/trips/" + net.trip.id, admin);
    const bookingA = passengers.body.manifest.find((m: any) => m.seatNumber === 1);
    const tokenA = await t.login("lugar.a@teste.ao");
    const live = await t.call<any>("GET", `/trips/${net.trip.id}/live`, tokenA);
    expect(live.status).toBe(200);
    expect(live.body.location).toMatchObject({ lat: -8.905, lng: 13.31 });
    expect(live.body.myStop.plannedTime).toBe("18:00");
    const outsider = await t.login("nao.subscrito@teste.ao");
    expect((await t.call("GET", `/trips/${net.trip.id}/live`, outsider)).status).toBe(403);

    // Passe digital: QR de curta duração, validação mínima e protecção contra reutilização.
    const qr = await t.call<any>("GET", "/passes/me/token", tokenA);
    expect(qr.status).toBe(200);
    const payload = JSON.parse(Buffer.from(qr.body.token.split(".")[1], "base64url").toString());
    expect(Object.keys(payload).sort()).toEqual(["aud", "exp", "iat", "jti", "pid"]);

    const ok = await t.call<any>("POST", "/passes/validate", driver, { token: qr.body.token, tripId: net.trip.id });
    expect(ok.body).toMatchObject({ result: "authorized", seatNumber: 1 });
    expect(ok.body.holder).toBe("Utilizador T.");
    const responseText = JSON.stringify(ok.body);
    expect(responseText).not.toContain("@");
    expect(responseText).not.toContain("25000");
    const replay = await t.call<any>("POST", "/passes/validate", driver, { token: qr.body.token, tripId: net.trip.id });
    expect(replay.body.result).toBe("invalid");
    expect(replay.body.reason).toContain("utilizado");
    expect((await t.call("POST", "/passes/validate", other, { token: qr.body.token, tripId: net.trip.id })).status).toBe(404);

    const boarded = await t.call<any>("GET", "/admin/trips/" + net.trip.id, admin);
    expect(boarded.body.manifest.find((m: any) => m.bookingId === bookingA.bookingId).status).toBe("boarded");

    const qrOld = await t.call<any>("GET", "/passes/me/token", tokenA);
    t.clock.now = new Date(t.clock.now.getTime() + 5 * 60_000);
    const expiredQr = await t.call<any>("POST", "/passes/validate", driver, { token: qrOld.body.token, tripId: net.trip.id });
    expect(expiredQr.body.result).toBe("invalid");
    expect(expiredQr.body.reason).toContain("expirou");

    const forged = await t.call<any>("POST", "/passes/validate", driver, { token: qr.body.token.slice(0, -4) + "AAAA", tripId: net.trip.id });
    expect(forged.body.result).toBe("invalid");

    // Estudante subscrito mas sem reserva nesta viagem.
    const tokenB = await t.login("lugar.b@teste.ao");
    const qrB = await t.call<any>("GET", "/passes/me/token", tokenB);
    const noBooking = await t.call<any>("POST", "/passes/validate", driver, { token: qrB.body.token, tripId: net.trip.id });
    expect(noBooking.body.result).toBe("booking_required");

    const finished = await t.call<any>("POST", `/driver/trips/${net.trip.id}/finish`, driver);
    expect(finished.body).toMatchObject({ status: "completed", noShows: 1 });
    const afterGps = await t.call<any>("POST", `/driver/trips/${net.trip.id}/locations`, driver, { points: [point] });
    expect(afterGps.status).toBe(400);
    const liveAfter = await t.call<any>("GET", `/trips/${net.trip.id}/live`, tokenA);
    expect(liveAfter.body.location).toBeNull();
  });

  it("subscrições suspensas e expiradas são recusadas na validação", async () => {
    const s = await subscribedStudent("estado.passe@teste.ao");
    const day2 = await t.call<any>("POST", "/admin/trips", admin, {
      routeId: net.route.id,
      scheduleId: net.schedule.id,
      serviceDate: "2026-11-03",
      vehicleId: net.vehicle.id,
      driverId: net.driver.id,
    });
    expect(day2.status).toBe(201);
    t.clock.now = new Date("2026-11-03T17:30:00+01:00");
    const driver = await t.login(net.driverEmail, net.driverPassword);
    expect((await t.call("POST", `/driver/trips/${day2.body.id}/start`, driver)).status).toBe(200);

    const subs = await t.call<any>("GET", "/admin/subscriptions?search=estado.passe", finance);
    const subId = subs.body.items[0].id;
    expect((await t.call("PATCH", `/admin/subscriptions/${subId}`, finance, { status: "suspended", reason: "Verificação de fraude" })).status).toBe(200);
    const token = await t.login("estado.passe@teste.ao");
    const qr1 = await t.call<any>("GET", "/passes/me/token", token);
    expect((await t.call<any>("POST", "/passes/validate", driver, { token: qr1.body.token, tripId: day2.body.id })).body.result).toBe("suspended");

    expect((await t.call("PATCH", `/admin/subscriptions/${subId}`, finance, { status: "active", reason: "Resolvido" })).status).toBe(200);
    // Um mês depois, as sessões antigas também expiraram: é preciso iniciar sessão de novo.
    t.clock.now = new Date("2026-12-05T17:30:00+01:00");
    expect((await t.call("GET", "/me", token)).status).toBe(401);
    const finance2 = await t.login("financeiro.fluxo@teste.ao");
    const job = await t.call<any>("POST", "/admin/jobs/expire-subscriptions", finance2);
    expect(job.body.expired).toBeGreaterThanOrEqual(1);
    const token2 = await t.login("estado.passe@teste.ao");
    const passView = await t.call<any>("GET", "/passes/me", token2);
    expect(passView.body.status).toBe("expired");
    const qr2 = await t.call<any>("GET", "/passes/me/token", token2);
    const res = await t.call<any>("POST", "/passes/validate", await t.login(net.driverEmail, net.driverPassword), { token: qr2.body.token, tripId: day2.body.id });
    expect(res.body.result).toBe("expired");
    const notes = await t.handle.db.select().from(notifications).where(eq(notifications.userId, s.id));
    expect(notes.filter((n) => n.kind === "subscription_expired")).toHaveLength(1);
  });
});
