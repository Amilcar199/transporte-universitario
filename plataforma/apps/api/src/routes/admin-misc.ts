import { and, desc, eq, gte, inArray, lte, sql, type Column } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission } from "@uni/shared";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  auditLogs,
  bookings,
  drivers,
  incidents,
  payments,
  platformSettings,
  refunds,
  routes,
  studentProfiles,
  studentVerifications,
  subscriptions,
  trips,
  users,
  vehicles,
} from "../db/schema.ts";
import { parse } from "../errors.ts";
import { dateSchema, localDate, PageQuery } from "../lib.ts";
import { managedUniversityIds } from "./admin-people.ts";

export const SettingsSchema = z.object({
  /** Antecedência mínima, em minutos, para o estudante cancelar uma reserva. */
  bookingCancelCutoffMinutes: z.coerce.number().int().min(0).max(24 * 60),
  /** Quantos dias à frente o estudante pode reservar. */
  bookingHorizonDays: z.coerce.number().int().min(0).max(30),
});
export type Settings = z.infer<typeof SettingsSchema>;

const DEFAULT_SETTINGS: Settings = { bookingCancelCutoffMinutes: 30, bookingHorizonDays: 7 };

export async function loadSettings(db: DbOrTx): Promise<Settings> {
  const rows = await db.select().from(platformSettings);
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const parsed = SettingsSchema.partial().safeParse(stored);
  return { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export async function adminMiscRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  app.get("/admin/dashboard", { preHandler: can("dashboard.view") }, async (request) => {
    const today = localDate(app.ctx.now());
    const role = request.auth!.role;
    // Um gestor de universidade só conta estudantes e subscrições das universidades que gere.
    const scope = await managedUniversityIds(db, request);
    const noScope = scope !== null && scope.length === 0;
    const inScope = (column: Column) => (scope && !noScope ? inArray(column, scope) : undefined);
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+01:00`);
    const [tripsToday, bookingsToday, pendingVerifications, paymentsToReview, activeSubscriptions, openIncidents, activeRoutes, activeVehicles, extra] =
      await Promise.all([
        db
          .select({ status: trips.status, n: sql<number>`count(*)::int` })
          .from(trips)
          .where(eq(trips.serviceDate, today))
          .groupBy(trips.status),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(bookings)
          .innerJoin(trips, eq(trips.id, bookings.tripId))
          .where(and(eq(trips.serviceDate, today), inArray(bookings.status, ["confirmed", "boarded"]))),
        noScope ? 0 : db.$count(studentVerifications, and(eq(studentVerifications.status, "pending"), inScope(studentVerifications.universityId))),
        db.$count(payments, eq(payments.status, "awaiting_review")),
        noScope ? 0 : db.$count(subscriptions, and(eq(subscriptions.status, "active"), inScope(subscriptions.universityId))),
        db.$count(incidents, inArray(incidents.status, ["open", "in_progress"])),
        db.$count(routes, eq(routes.status, "active")),
        db.$count(vehicles, eq(vehicles.status, "active")),
        Promise.all([
          !hasPermission(role, "students.read") ? null : noScope ? 0 : db.$count(studentProfiles, inScope(studentProfiles.universityId)),
          !hasPermission(role, "subscriptions.read") ? null : noScope ? 0 : db.$count(subscriptions, and(eq(subscriptions.status, "pending_payment"), inScope(subscriptions.universityId))),
          !hasPermission(role, "payments.read")
            ? null
            : db
                .select({ n: sql<number>`count(*)::int`, kz: sql<number>`coalesce(sum(${payments.amountKz}), 0)::int` })
                .from(payments)
                .where(and(eq(payments.status, "confirmed"), gte(payments.confirmedAt, monthStart)))
                .then((r) => r[0] ?? { n: 0, kz: 0 }),
          !hasPermission(role, "refunds.manage")
            ? null
            : db
                .select({ n: sql<number>`count(*)::int`, kz: sql<number>`coalesce(sum(${refunds.amountKz}), 0)::int` })
                .from(refunds)
                .where(inArray(refunds.status, ["approved", "paid"]))
                .then((r) => r[0] ?? { n: 0, kz: 0 }),
          !hasPermission(role, "trips.read")
            ? null
            : Promise.all([
                db
                  .select({ n: sql<number>`count(distinct ${trips.driverId})::int` })
                  .from(trips)
                  .where(and(eq(trips.serviceDate, today), eq(trips.status, "in_progress")))
                  .then((r) => r[0]?.n ?? 0),
                db
                  .select({ n: sql<number>`count(*)::int` })
                  .from(drivers)
                  .innerJoin(users, eq(users.id, drivers.userId))
                  .where(eq(users.status, "active"))
                  .then((r) => r[0]?.n ?? 0),
              ]),
          db.$count(routes, and(eq(routes.status, "active"), eq(routes.isDemo, true))),
        ]),
      ]);
    const [registeredStudents, pendingPaymentSubscriptions, confirmedThisMonth, approvedRefunds, driverCounts, activeDemoRoutes] = extra;
    return {
      date: today,
      tripsToday: Object.fromEntries(tripsToday.map((r) => [r.status, r.n])),
      bookingsToday: bookingsToday[0]?.n ?? 0,
      pendingVerifications,
      paymentsToReview,
      activeSubscriptions,
      openIncidents,
      activeRoutes,
      activeVehicles,
      registeredStudents,
      pendingPaymentSubscriptions,
      confirmedPaymentsThisMonth: confirmedThisMonth ? { count: confirmedThisMonth.n, totalKz: confirmedThisMonth.kz } : null,
      approvedRefunds: approvedRefunds ? { count: approvedRefunds.n, totalKz: approvedRefunds.kz } : null,
      drivers: driverCounts ? { onDuty: driverCounts[0], active: driverCounts[1] } : null,
      hasDemoData: activeDemoRoutes > 0,
    };
  });

  app.get("/admin/audit", { preHandler: can("audit.read") }, async (request) => {
    const q = parse(
      PageQuery.extend({
        action: z.string().trim().max(60).optional(),
        result: z.enum(["success", "denied", "failure"]).optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
      }),
      request.query,
    );
    const where = and(
      q.action ? sql`${auditLogs.action} like ${`${q.action.replace(/[%_\\]/g, (c) => `\\${c}`)}%`}` : undefined,
      q.result ? eq(auditLogs.result, q.result) : undefined,
      q.from ? gte(auditLogs.createdAt, new Date(`${q.from}T00:00:00+01:00`)) : undefined,
      q.to ? lte(auditLogs.createdAt, new Date(`${q.to}T23:59:59.999+01:00`)) : undefined,
    );
    const [items, total] = await Promise.all([
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          result: auditLogs.result,
          details: auditLogs.details,
          ip: auditLogs.ip,
          createdAt: auditLogs.createdAt,
          actorRole: auditLogs.actorRole,
          actorName: users.fullName,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .where(where)
        .orderBy(desc(auditLogs.id))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(auditLogs, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/admin/settings", { preHandler: can("settings.manage") }, async () => loadSettings(db));

  app.put("/admin/settings", { preHandler: can("settings.manage") }, async (request) => {
    const body = parse(SettingsSchema.partial(), request.body);
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(body)) {
        await tx
          .insert(platformSettings)
          .values({ key, value })
          .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: app.ctx.now() } });
      }
      await audit(tx, request, { action: "settings.update", entityType: "settings", details: body });
    });
    return loadSettings(db);
  });
}
