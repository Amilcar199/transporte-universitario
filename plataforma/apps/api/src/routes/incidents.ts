import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { INCIDENT_KINDS, INCIDENT_STATUSES } from "@uni/shared";
import { audit } from "../audit.ts";
import { can, requireAuth } from "../auth/guard.ts";
import { bookings, incidents, notifications, trips, users } from "../db/schema.ts";
import { forbidden, notFound, parse } from "../errors.ts";
import { notify, PageQuery, uuidParam } from "../lib.ts";

const IncidentCreate = z.object({
  kind: z.enum(INCIDENT_KINDS),
  description: z.string().trim().min(5, "Descreva a ocorrência.").max(2000),
  tripId: z.string().uuid().nullable().optional(),
});

export async function incidentRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  app.post("/incidents", { preHandler: requireAuth }, async (request, reply) => {
    const body = parse(IncidentCreate, request.body);
    const auth = request.auth!;
    if (auth.role !== "student" && auth.role !== "driver") throw forbidden();
    if (body.tripId) {
      const [trip] = await db.select({ driverId: trips.driverId }).from(trips).where(eq(trips.id, body.tripId));
      if (!trip) throw notFound("Viagem não encontrada.");
      const related =
        auth.role === "driver"
          ? trip.driverId === auth.userId
          : (await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.tripId, body.tripId), eq(bookings.studentId, auth.userId)))).length > 0;
      if (!related) throw forbidden("Só pode reportar ocorrências de viagens em que participa.");
    }
    const [created] = await db
      .insert(incidents)
      .values({ reporterId: auth.userId, tripId: body.tripId ?? null, kind: body.kind, description: body.description })
      .returning();
    await audit(db, request, { action: "incident.create", entityType: "incident", entityId: created!.id, details: { kind: body.kind } });
    return reply.status(201).send(created);
  });

  app.get("/incidents/me", { preHandler: requireAuth }, async (request) =>
    db.select().from(incidents).where(eq(incidents.reporterId, request.auth!.userId)).orderBy(desc(incidents.createdAt)).limit(50),
  );

  app.get("/admin/incidents", { preHandler: can("incidents.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(INCIDENT_STATUSES).optional() }), request.query);
    const where = q.status ? eq(incidents.status, q.status) : inArray(incidents.status, ["open", "in_progress"]);
    const [items, total] = await Promise.all([
      db
        .select({
          id: incidents.id,
          kind: incidents.kind,
          description: incidents.description,
          status: incidents.status,
          tripId: incidents.tripId,
          resolutionNote: incidents.resolutionNote,
          createdAt: incidents.createdAt,
          reporterName: users.fullName,
          reporterRole: users.role,
        })
        .from(incidents)
        .innerJoin(users, eq(users.id, incidents.reporterId))
        .where(where)
        .orderBy(desc(incidents.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(incidents, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.patch("/admin/incidents/:id", { preHandler: can("incidents.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ status: z.enum(INCIDENT_STATUSES), resolutionNote: z.string().trim().max(2000).optional() }), request.body);
    const [updated] = await db
      .update(incidents)
      .set({ status: body.status, resolutionNote: body.resolutionNote, assignedTo: request.auth!.userId, updatedAt: app.ctx.now() })
      .where(eq(incidents.id, id))
      .returning();
    if (!updated) throw notFound("Ocorrência não encontrada.");
    if (body.status === "resolved") {
      await notify(db, {
        userId: updated.reporterId,
        title: "Ocorrência resolvida",
        body: body.resolutionNote ?? "A sua ocorrência foi resolvida.",
        kind: "incident",
        dedupeKey: `incident_resolved:${id}`,
      });
    }
    await audit(db, request, { action: "incident.update", entityType: "incident", entityId: id, details: { status: body.status } });
    return updated;
  });

  // ------------------------------------------------------------ Notificações na aplicação
  app.get("/notifications", { preHandler: requireAuth }, async (request) =>
    db
      .select({ id: notifications.id, title: notifications.title, body: notifications.body, kind: notifications.kind, readAt: notifications.readAt, createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.userId, request.auth!.userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50),
  );

  app.post("/notifications/read-all", { preHandler: requireAuth }, async (request) => {
    const updated = await db
      .update(notifications)
      .set({ readAt: app.ctx.now() })
      .where(and(eq(notifications.userId, request.auth!.userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return { updated: updated.length };
  });
}
