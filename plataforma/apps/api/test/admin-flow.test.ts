import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createTestApp } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "unirota-admin-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("aceitação do painel administrativo", () => {
  it("cria universidade, rota, paragens, horário, veículo, motorista e atribuição que persistem após reiniciar", async () => {
    const url = `pglite:${dir}`;
    let t = await createTestApp({ databaseUrl: url });
    await t.createUser("super_admin", "admin.aceitacao@teste.ao");
    let admin = await t.login("admin.aceitacao@teste.ao");

    const uni = await t.call<any>("POST", "/admin/universities", admin, { name: "Universidade Óscar Ribas", shortName: "UOR-T", city: "Luanda" });
    expect(uni.status).toBe(201);
    const s1 = await t.call<any>("POST", "/admin/stops", admin, { name: "Viana", city: "Luanda", lat: -8.9, lng: 13.36 });
    const s2 = await t.call<any>("POST", "/admin/stops", admin, { name: "Benfica", city: "Luanda", lat: -8.96, lng: 13.18 });
    const dest = await t.call<any>("POST", "/admin/stops", admin, { name: "Campus UÓR", city: "Luanda", lat: -8.91, lng: 13.18, kind: "destination", universityId: uni.body.id });
    expect([s1.status, s2.status, dest.status]).toEqual([201, 201, 201]);

    const badDest = await t.call<any>("POST", "/admin/stops", admin, { name: "Destino sem universidade", city: "Luanda", lat: -8.9, lng: 13.2, kind: "destination" });
    expect(badDest.status).toBe(400);

    const route = await t.call<any>("POST", "/admin/routes", admin, { code: "via-uor", name: "Viana → UÓR", direction: "to_university", universityIds: [uni.body.id] });
    expect(route.status).toBe(201);
    expect(route.body.code).toBe("VIA-UOR");
    expect(route.body.status).toBe("draft");

    const early = await t.call<any>("PATCH", `/admin/routes/${route.body.id}`, admin, { status: "active" });
    expect(early.status).toBe(400);
    expect(early.body.error.message).toContain("paragens");

    const ordered = await t.call<any>("PUT", `/admin/routes/${route.body.id}/stops`, admin, {
      stops: [
        { stopId: s1.body.id, minutesFromStart: 0 },
        { stopId: s2.body.id, minutesFromStart: 35 },
        { stopId: dest.body.id, minutesFromStart: 50 },
      ],
    });
    expect(ordered.status).toBe(200);
    expect(ordered.body.stops.map((s: any) => s.name)).toEqual(["Viana", "Benfica", "Campus UÓR"]);

    const schedule = await t.call<any>("POST", `/admin/routes/${route.body.id}/schedules`, admin, { departureTime: "06:15", daysOfWeek: [1, 2, 3, 4, 5] });
    expect(schedule.status).toBe(201);
    const activated = await t.call<any>("PATCH", `/admin/routes/${route.body.id}`, admin, { status: "active" });
    expect(activated.status).toBe(200);

    const vehicle = await t.call<any>("POST", "/admin/vehicles", admin, { plate: "ld-12-34-ab", model: "Toyota Coaster", capacity: 29 });
    expect(vehicle.status).toBe(201);
    expect(vehicle.body.plate).toBe("LD-12-34-AB");
    const dupPlate = await t.call<any>("POST", "/admin/vehicles", admin, { plate: "LD-12-34-AB", model: "Outro", capacity: 10 });
    expect(dupPlate.status).toBe(409);
    expect(dupPlate.body.error.message).toContain("matrícula");

    const driver = await t.call<any>("POST", "/admin/drivers", admin, {
      fullName: "Manuel Motorista",
      email: "manuel.motorista@teste.ao",
      temporaryPassword: "temporaria-segura",
      licenceNumber: "LA-123456",
      defaultVehicleId: vehicle.body.id,
    });
    expect(driver.status).toBe(201);
    expect(JSON.stringify(driver.body)).not.toContain("temporaria-segura");

    // 2026-11-02 é segunda-feira; o horário opera de segunda a sexta.
    const trip = await t.call<any>("POST", "/admin/trips", admin, {
      routeId: route.body.id,
      scheduleId: schedule.body.id,
      serviceDate: "2026-11-03",
      vehicleId: vehicle.body.id,
      driverId: driver.body.id,
    });
    expect(trip.status).toBe(201);
    expect(trip.body.departureTime).toBe("06:15");
    expect(trip.body.capacity).toBe(29);

    const sunday = await t.call<any>("POST", "/admin/trips", admin, { routeId: route.body.id, scheduleId: schedule.body.id, serviceDate: "2026-11-08", vehicleId: vehicle.body.id, driverId: driver.body.id });
    expect(sunday.status).toBe(400);
    const past = await t.call<any>("POST", "/admin/trips", admin, { routeId: route.body.id, scheduleId: schedule.body.id, serviceDate: "2026-10-30", vehicleId: vehicle.body.id, driverId: driver.body.id });
    expect(past.status).toBe(400);
    const twice = await t.call<any>("POST", "/admin/trips", admin, { routeId: route.body.id, scheduleId: schedule.body.id, serviceDate: "2026-11-03", vehicleId: vehicle.body.id, driverId: driver.body.id });
    expect(twice.status).toBe(409);

    // Reinicia a API sobre a mesma base de dados em disco (equivalente a recarregar o painel).
    await t.close();
    t = await createTestApp({ databaseUrl: url });
    admin = await t.login("admin.aceitacao@teste.ao");

    const detail = await t.call<any>("GET", `/admin/routes/${route.body.id}`, admin);
    expect(detail.status).toBe(200);
    expect(detail.body.status).toBe("active");
    expect(detail.body.universities.map((u: any) => u.shortName)).toEqual(["UOR-T"]);
    expect(detail.body.stops).toHaveLength(3);
    expect(detail.body.schedules[0].departureTime).toBe("06:15");

    const routeList = await t.call<any>("GET", "/admin/routes", admin);
    expect(routeList.body.items.find((r: any) => r.id === route.body.id)).toMatchObject({ stopCount: 3, scheduleCount: 1, universityNames: "UOR-T" });

    const trips = await t.call<any>("GET", "/admin/trips?date=2026-11-03", admin);
    expect(trips.body.items).toHaveLength(1);
    expect(trips.body.items[0]).toMatchObject({ routeCode: "VIA-UOR", vehiclePlate: "LD-12-34-AB", driverName: "Manuel Motorista", booked: 0 });

    const drivers = await t.call<any>("GET", "/admin/drivers", admin);
    expect(drivers.body.items.map((d: any) => d.email)).toContain("manuel.motorista@teste.ao");

    // O motorista criado pelo painel consegue entrar e vê a viagem atribuída.
    const driverLogin = await t.call<any>("POST", "/auth/login", undefined, { email: "manuel.motorista@teste.ao", password: "temporaria-segura" });
    expect(driverLogin.status).toBe(200);
    const mine = await t.call<any>("GET", "/driver/trips", driverLogin.body.accessToken);
    expect(mine.body.map((x: any) => x.id)).toContain(trip.body.id);

    const auditLog = await t.call<any>("GET", "/admin/audit?action=trip", admin);
    expect(auditLog.body.items.some((e: any) => e.action === "trip.assign")).toBe(true);

    const dashboard = await t.call<any>("GET", "/admin/dashboard", admin);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.activeRoutes).toBe(1);
    expect(dashboard.body.activeVehicles).toBe(1);
    await t.close();
  });

  it("a visão geral só mostra os indicadores que o perfil pode ver", async () => {
    const { createNetwork } = await import("./helpers.ts");
    const t = await createTestApp();
    await t.createUser("super_admin", "admin.kpi@teste.ao");
    const admin = await t.login("admin.kpi@teste.ao");
    const net = await createNetwork(t, admin);
    await t.createUser("student", "estudante.kpi@teste.ao", { verifiedUniversityId: net.uni.id });

    const full = await t.call<any>("GET", "/admin/dashboard", admin);
    expect(full.status).toBe(200);
    expect(full.body).toMatchObject({
      registeredStudents: 1,
      pendingPaymentSubscriptions: 0,
      confirmedPaymentsThisMonth: { count: 0, totalKz: 0 },
      approvedRefunds: { count: 0, totalKz: 0 },
      drivers: { onDuty: 0, active: 1 },
      hasDemoData: false,
    });

    await t.createUser("finance", "financas.kpi@teste.ao");
    const finance = await t.call<any>("GET", "/admin/dashboard", await t.login("financas.kpi@teste.ao"));
    expect(finance.body).toMatchObject({ registeredStudents: null, drivers: null, confirmedPaymentsThisMonth: { count: 0, totalKz: 0 } });

    await t.createUser("university_manager", "gestor.kpi@teste.ao");
    const manager = await t.call<any>("GET", "/admin/dashboard", await t.login("gestor.kpi@teste.ao"));
    expect(manager.body).toMatchObject({ registeredStudents: 0, pendingVerifications: 0, activeSubscriptions: 0, confirmedPaymentsThisMonth: null });
    await t.close();
  });

  it("cancelar uma viagem cancela as reservas e notifica sem duplicar", async () => {
    const { createNetwork } = await import("./helpers.ts");
    const t = await createTestApp();
    await t.createUser("super_admin", "admin.cancel@teste.ao");
    const admin = await t.login("admin.cancel@teste.ao");
    const net = await createNetwork(t, admin);
    const noReason = await t.call<any>("PATCH", `/admin/trips/${net.trip.id}`, admin, { status: "cancelled" });
    expect(noReason.status).toBe(400);
    const cancelled = await t.call<any>("PATCH", `/admin/trips/${net.trip.id}`, admin, { status: "cancelled", cancelReason: "Avaria do veículo" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");
    const again = await t.call<any>("PATCH", `/admin/trips/${net.trip.id}`, admin, { status: "cancelled", cancelReason: "Outra vez" });
    expect(again.status).toBe(400);
    await t.close();
  });
});
