import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  auditLogs,
  bookings,
  incidents,
  payments,
  platformSettings,
  routes,
  studentVerifications,
  subscriptions,
  trips,
  users,
  vehicles,
} from "../db/schema.ts";
import { parse } from "../errors.ts";
import { dateSchema, localDate, PageQuery } from "../lib.ts";

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

  app.get("/admin/dashboard", { preHandler: can("dashboard.view") }, async () => {
    const today = localDate(app.ctx.now());
    const [tripsToday, bookingsToday, pendingVerifications, paymentsToReview, activeSubscriptions, openIncidents, activeRoutes, activeVehicles] =
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
        db.$count(studentVerifications, eq(studentVerifications.status, "pending")),
        db.$count(payments, eq(payments.status, "awaiting_review")),
        db.$count(subscriptions, eq(subscriptions.status, "active")),
        db.$count(incidents, inArray(incidents.status, ["open", "in_progress"])),
        db.$count(routes, eq(routes.status, "active")),
        db.$count(vehicles, eq(vehicles.status, "active")),
      ]);
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
