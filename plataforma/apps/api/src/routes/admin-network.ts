import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ROUTE_DIRECTIONS, ROUTE_SERVICE_TYPES, ROUTE_STATUSES, STOP_KINDS } from "@uni/shared";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import { routes, routeStops, routeUniversities, schedules, stops, universities } from "../db/schema.ts";
import { badRequest, notFound, parse } from "../errors.ts";
import { dateSchema, ilikeAny, PageQuery, qualified, timeSchema, uuidParam } from "../lib.ts";

const lat = z.coerce.number().min(-90, "Latitude inválida.").max(90, "Latitude inválida.");
const lng = z.coerce.number().min(-180, "Longitude inválida.").max(180, "Longitude inválida.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const UniversityInput = z.object({
  name: z.string().trim().min(3, "Indique o nome.").max(160),
  shortName: z.string().trim().min(2, "Indique a sigla.").max(20),
  city: z.string().trim().min(2, "Indique a cidade.").max(80),
  address: optionalText(200),
  lat: lat.nullable().optional(),
  lng: lng.nullable().optional(),
  active: z.boolean().optional(),
});

const StopInput = z.object({
  name: z.string().trim().min(2, "Indique o nome da paragem.").max(120),
  neighbourhood: optionalText(80),
  landmark: optionalText(160),
  city: z.string().trim().min(2, "Indique a cidade.").max(80),
  lat,
  lng,
  kind: z.enum(STOP_KINDS).default("pickup"),
  universityId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});

const RouteInput = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Indique o código.")
    .max(20)
    .regex(/^[A-Za-z0-9\-]+$/, "Use apenas letras, números e hífen.")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(3, "Indique o nome.").max(120),
  description: optionalText(500),
  direction: z.enum(ROUTE_DIRECTIONS),
  serviceType: z.enum(ROUTE_SERVICE_TYPES).optional(),
  status: z.enum(ROUTE_STATUSES).optional(),
  universityIds: z.array(z.string().uuid()).optional(),
});

const ScheduleInput = z.object({
  departureTime: timeSchema,
  daysOfWeek: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Seleccione pelo menos um dia.")
    .transform((d) => [...new Set(d)].sort()),
  active: z.boolean().optional(),
  validFrom: dateSchema.nullable().optional(),
  validTo: dateSchema.nullable().optional(),
});

/** Carrega uma rota com universidades, paragens ordenadas e horários. */
export async function loadRouteDetail(db: DbOrTx, routeId: string) {
  const [route] = await db.select().from(routes).where(eq(routes.id, routeId));
  if (!route) throw notFound("Rota não encontrada.");
  const [unis, stopRows, scheduleRows] = await Promise.all([
    db
      .select({ id: universities.id, name: universities.name, shortName: universities.shortName })
      .from(routeUniversities)
      .innerJoin(universities, eq(universities.id, routeUniversities.universityId))
      .where(eq(routeUniversities.routeId, routeId))
      .orderBy(asc(universities.shortName)),
    db
      .select({
        routeStopId: routeStops.id,
        position: routeStops.position,
        minutesFromStart: routeStops.minutesFromStart,
        stopId: stops.id,
        name: stops.name,
        neighbourhood: stops.neighbourhood,
        landmark: stops.landmark,
        lat: stops.lat,
        lng: stops.lng,
        kind: stops.kind,
        active: stops.active,
      })
      .from(routeStops)
      .innerJoin(stops, eq(stops.id, routeStops.stopId))
      .where(eq(routeStops.routeId, routeId))
      .orderBy(asc(routeStops.position)),
    db.select().from(schedules).where(eq(schedules.routeId, routeId)).orderBy(asc(schedules.departureTime)),
  ]);
  return { ...route, universities: unis, stops: stopRows, schedules: scheduleRows };
}

/** Uma rota só pode ser activada quando tem a configuração mínima para operar. */
async function assertRouteCanActivate(db: DbOrTx, routeId: string) {
  const detail = await loadRouteDetail(db, routeId);
  const problems: string[] = [];
  const university = detail.serviceType === "university";
  if (university && detail.universities.length === 0) problems.push("associe pelo menos uma universidade");
  if (detail.stops.length < 2) problems.push("adicione pelo menos duas paragens");
  const destinationIndex = detail.direction === "to_university" ? detail.stops.length - 1 : 0;
  if (university && detail.stops.length >= 2 && detail.stops[destinationIndex]?.kind !== "destination") {
    problems.push(
      detail.direction === "to_university"
        ? "a última paragem deve ser um destino (universidade)"
        : "a primeira paragem deve ser um destino (universidade)",
    );
  }
  if (!detail.schedules.some((s) => s.active)) problems.push("configure pelo menos um horário activo");
  if (problems.length > 0) throw badRequest(`Não é possível activar a rota: ${problems.join("; ")}.`);
}

export async function adminNetworkRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  // ------------------------------------------------------------ Universidades
  app.get("/admin/universities", { preHandler: can("universities.read") }, async (request) => {
    const q = parse(PageQuery.extend({ active: z.enum(["true", "false"]).optional() }), request.query);
    const filters: (SQL | undefined)[] = [
      ilikeAny(q.search, sql`${universities.name}`, sql`${universities.shortName}`, sql`${universities.city}`),
      q.active ? eq(universities.active, q.active === "true") : undefined,
    ];
    const where = and(...filters);
    const [items, total] = await Promise.all([
      db
        .select()
        .from(universities)
        .where(where)
        .orderBy(asc(universities.shortName))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(universities, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/universities", { preHandler: can("universities.write") }, async (request, reply) => {
    const body = parse(UniversityInput, request.body);
    const [created] = await db.insert(universities).values(body).returning();
    await audit(db, request, { action: "university.create", entityType: "university", entityId: created!.id, details: { name: body.name } });
    return reply.status(201).send(created);
  });

  app.patch("/admin/universities/:id", { preHandler: can("universities.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(UniversityInput.partial(), request.body);
    const [updated] = await db
      .update(universities)
      .set({ ...body, updatedAt: app.ctx.now() })
      .where(eq(universities.id, id))
      .returning();
    if (!updated) throw notFound("Universidade não encontrada.");
    await audit(db, request, { action: "university.update", entityType: "university", entityId: id, details: { fields: Object.keys(body) } });
    return updated;
  });

  // ------------------------------------------------------------ Paragens
  app.get("/admin/stops", { preHandler: can("routes.read") }, async (request) => {
    const q = parse(
      PageQuery.extend({ kind: z.enum(STOP_KINDS).optional(), active: z.enum(["true", "false"]).optional() }),
      request.query,
    );
    const where = and(
      ilikeAny(q.search, sql`${stops.name}`, sql`${stops.neighbourhood}`, sql`${stops.landmark}`, sql`${stops.city}`),
      q.kind ? eq(stops.kind, q.kind) : undefined,
      q.active ? eq(stops.active, q.active === "true") : undefined,
    );
    const [items, total] = await Promise.all([
      db
        .select({
          id: stops.id,
          name: stops.name,
          neighbourhood: stops.neighbourhood,
          landmark: stops.landmark,
          city: stops.city,
          lat: stops.lat,
          lng: stops.lng,
          kind: stops.kind,
          universityId: stops.universityId,
          universityShortName: universities.shortName,
          active: stops.active,
          isDemo: stops.isDemo,
        })
        .from(stops)
        .leftJoin(universities, eq(universities.id, stops.universityId))
        .where(where)
        .orderBy(asc(stops.name))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(stops, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/stops", { preHandler: can("routes.write") }, async (request, reply) => {
    const body = parse(StopInput, request.body);
    if (body.kind === "destination" && !body.universityId) {
      throw badRequest("Um destino tem de estar associado a uma universidade.", { fields: { universityId: "Obrigatório para destinos." } });
    }
    const [created] = await db.insert(stops).values(body).returning();
    await audit(db, request, { action: "stop.create", entityType: "stop", entityId: created!.id, details: { name: body.name } });
    return reply.status(201).send(created);
  });

  app.patch("/admin/stops/:id", { preHandler: can("routes.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(StopInput.partial(), request.body);
    const [updated] = await db.update(stops).set({ ...body, updatedAt: app.ctx.now() }).where(eq(stops.id, id)).returning();
    if (!updated) throw notFound("Paragem não encontrada.");
    await audit(db, request, { action: "stop.update", entityType: "stop", entityId: id, details: { fields: Object.keys(body) } });
    return updated;
  });

  // ------------------------------------------------------------ Rotas
  app.get("/admin/routes", { preHandler: can("routes.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(ROUTE_STATUSES).optional() }), request.query);
    const where = and(
      ilikeAny(q.search, sql`${routes.code}`, sql`${routes.name}`),
      q.status ? eq(routes.status, q.status) : undefined,
    );
    const [items, total] = await Promise.all([
      db
        .select({
          id: routes.id,
          code: routes.code,
          name: routes.name,
          direction: routes.direction,
          serviceType: routes.serviceType,
          status: routes.status,
          isDemo: routes.isDemo,
          stopCount: sql<number>`(select count(*)::int from ${routeStops} where ${qualified(routeStops.routeId)} = ${qualified(routes.id)})`,
          scheduleCount: sql<number>`(select count(*)::int from ${schedules} where ${qualified(schedules.routeId)} = ${qualified(routes.id)} and ${qualified(schedules.active)})`,
          universityNames: sql<string>`coalesce((select string_agg(${qualified(universities.shortName)}, ', ' order by ${qualified(universities.shortName)}) from ${routeUniversities} join ${universities} on ${qualified(universities.id)} = ${qualified(routeUniversities.universityId)} where ${qualified(routeUniversities.routeId)} = ${qualified(routes.id)}), '')`,
        })
        .from(routes)
        .where(where)
        .orderBy(asc(routes.code))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(routes, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/admin/routes/:id", { preHandler: can("routes.read") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    return loadRouteDetail(db, id);
  });

  app.post("/admin/routes", { preHandler: can("routes.write") }, async (request, reply) => {
    const body = parse(RouteInput, request.body);
    if (body.status === "active") throw badRequest("Crie a rota como rascunho e active-a depois de configurar paragens e horários.");
    const id = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(routes)
        .values({
          code: body.code,
          name: body.name,
          description: body.description ?? null,
          direction: body.direction,
          serviceType: body.serviceType ?? "university",
          status: "draft",
        })
        .returning({ id: routes.id });
      if (body.universityIds?.length) {
        await tx.insert(routeUniversities).values(body.universityIds.map((universityId) => ({ routeId: created!.id, universityId })));
      }
      await audit(tx, request, { action: "route.create", entityType: "route", entityId: created!.id, details: { code: body.code } });
      return created!.id;
    });
    return reply.status(201).send(await loadRouteDetail(db, id));
  });

  app.patch("/admin/routes/:id", { preHandler: can("routes.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(RouteInput.partial(), request.body);
    await db.transaction(async (tx) => {
      const { universityIds, ...fields } = body;
      const [updated] = await tx
        .update(routes)
        .set({ ...fields, updatedAt: app.ctx.now() })
        .where(eq(routes.id, id))
        .returning({ id: routes.id, status: routes.status });
      if (!updated) throw notFound("Rota não encontrada.");
      if (universityIds) {
        await tx.delete(routeUniversities).where(eq(routeUniversities.routeId, id));
        if (universityIds.length) {
          await tx.insert(routeUniversities).values(universityIds.map((universityId) => ({ routeId: id, universityId })));
        }
      }
      // Qualquer alteração a uma rota activa (tipo, sentido, universidades) tem de a manter operável.
      if (updated.status === "active") await assertRouteCanActivate(tx, id);
      await audit(tx, request, { action: "route.update", entityType: "route", entityId: id, details: { fields: Object.keys(body) } });
    });
    return loadRouteDetail(db, id);
  });

  /** Substitui a lista ordenada de paragens da rota (a ordem do array é a ordem de passagem). */
  app.put("/admin/routes/:id/stops", { preHandler: can("routes.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(
      z.object({
        stops: z
          .array(z.object({ stopId: z.string().uuid(), minutesFromStart: z.number().int().min(0).max(600) }))
          .max(60, "Máximo de 60 paragens por rota."),
      }),
      request.body,
    );
    const ids = body.stops.map((s) => s.stopId);
    if (new Set(ids).size !== ids.length) throw badRequest("A mesma paragem aparece mais de uma vez.");
    for (let i = 1; i < body.stops.length; i++) {
      if (body.stops[i]!.minutesFromStart < body.stops[i - 1]!.minutesFromStart) {
        throw badRequest("Os minutos desde a partida devem aumentar ao longo da rota.");
      }
    }
    await db.transaction(async (tx) => {
      const [route] = await tx.select({ status: routes.status }).from(routes).where(eq(routes.id, id)).for("update");
      if (!route) throw notFound("Rota não encontrada.");
      if (ids.length) {
        const found = await tx.select({ id: stops.id }).from(stops).where(inArray(stops.id, ids));
        if (found.length !== ids.length) throw badRequest("Uma ou mais paragens não existem.");
      }
      await tx.delete(routeStops).where(eq(routeStops.routeId, id));
      if (body.stops.length) {
        await tx.insert(routeStops).values(
          body.stops.map((s, index) => ({ routeId: id, stopId: s.stopId, position: index + 1, minutesFromStart: s.minutesFromStart })),
        );
      }
      if (route.status === "active") await assertRouteCanActivate(tx, id);
      await audit(tx, request, { action: "route.set_stops", entityType: "route", entityId: id, details: { count: ids.length } });
    });
    return loadRouteDetail(db, id);
  });

  // ------------------------------------------------------------ Horários
  app.post("/admin/routes/:id/schedules", { preHandler: can("routes.write") }, async (request, reply) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(ScheduleInput, request.body);
    const [route] = await db.select({ id: routes.id }).from(routes).where(eq(routes.id, id));
    if (!route) throw notFound("Rota não encontrada.");
    const [created] = await db.insert(schedules).values({ ...body, routeId: id }).returning();
    await audit(db, request, { action: "schedule.create", entityType: "schedule", entityId: created!.id, details: { routeId: id, departureTime: body.departureTime } });
    return reply.status(201).send(created);
  });

  app.patch("/admin/schedules/:id", { preHandler: can("routes.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(ScheduleInput.partial(), request.body);
    const [updated] = await db.update(schedules).set(body).where(eq(schedules.id, id)).returning();
    if (!updated) throw notFound("Horário não encontrado.");
    await audit(db, request, { action: "schedule.update", entityType: "schedule", entityId: id, details: { fields: Object.keys(body) } });
    return updated;
  });

  // Lista resumida para selectores do painel.
  app.get("/admin/options", { preHandler: can("dashboard.view") }, async () => {
    const [uniRows, routeRows] = await Promise.all([
      db.select({ id: universities.id, label: universities.shortName, name: universities.name, active: universities.active }).from(universities).orderBy(asc(universities.shortName)),
      db.select({ id: routes.id, label: routes.code, name: routes.name, status: routes.status }).from(routes).orderBy(asc(routes.code)),
    ]);
    return { universities: uniRows, routes: routeRows };
  });
}
