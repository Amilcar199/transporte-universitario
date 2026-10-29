import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission, ROUTE_SERVICE_TYPES } from "@uni/shared";
import { audit } from "../audit.ts";
import { can, requireAuth } from "../auth/guard.ts";
import {
  bookings,
  routes,
  routeStops,
  routeUniversities,
  stops,
  studentProfiles,
  studentVerifications,
  trips,
  universities,
} from "../db/schema.ts";
import { badRequest, conflict, forbidden, notFound, parse } from "../errors.ts";
import { addDays, dateSchema, distanceMeters, ilikeAny, localDate, localTime, minutesOf, qualified, timePlusMinutes, uuidParam } from "../lib.ts";
import { currentSubscription } from "../services/billing.ts";
import { lockIntercityAllowance, routeCoverage } from "../services/coverage.ts";
import { loadSettings } from "./admin-misc.ts";
import { loadRouteDetail } from "./admin-network.ts";
import { latestLocation } from "./admin-trips.ts";

const BookingCreate = z.object({ tripId: z.string().uuid(), stopId: z.string().uuid() });

const VerificationCreate = z.object({
  universityId: z.string().uuid(),
  studentNumber: z.string().trim().min(3, "Indique o número de estudante.").max(30),
  documentNote: z.string().trim().max(300).optional(),
});

/** Minutos entre agora (hora local) e a partida da viagem. Negativo se já partiu. */
function minutesUntil(now: Date, serviceDate: string, departureTime: string): number {
  const today = localDate(now);
  const dayDiff = Math.round((Date.parse(`${serviceDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return dayDiff * 24 * 60 + minutesOf(departureTime) - minutesOf(localTime(now));
}

const seatsTaken = sql<number>`(select count(*)::int from ${bookings} where ${qualified(bookings.tripId)} = ${qualified(trips.id)} and ${qualified(bookings.status)} in ('confirmed', 'boarded'))`;

export async function studentRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  // ------------------------------------------------------------ Catálogo público (sem dados pessoais)
  app.get("/universities", async () =>
    db
      .select({ id: universities.id, name: universities.name, shortName: universities.shortName, city: universities.city, isDemo: universities.isDemo })
      .from(universities)
      .where(eq(universities.active, true))
      .orderBy(asc(universities.shortName)),
  );

  app.get("/stops/search", async (request) => {
    const q = parse(
      z.object({
        q: z.string().trim().max(80).optional(),
        universityId: z.string().uuid().optional(),
        lat: z.coerce.number().min(-90).max(90).optional(),
        lng: z.coerce.number().min(-180).max(180).optional(),
      }),
      request.query,
    );
    const rows = await db
      .selectDistinct({
        id: stops.id,
        name: stops.name,
        neighbourhood: stops.neighbourhood,
        landmark: stops.landmark,
        city: stops.city,
        lat: stops.lat,
        lng: stops.lng,
        kind: stops.kind,
        isDemo: stops.isDemo,
      })
      .from(stops)
      .innerJoin(routeStops, eq(routeStops.stopId, stops.id))
      .innerJoin(routes, and(eq(routes.id, routeStops.routeId), eq(routes.status, "active")))
      .innerJoin(routeUniversities, eq(routeUniversities.routeId, routes.id))
      .where(
        and(
          eq(stops.active, true),
          q.universityId ? eq(routeUniversities.universityId, q.universityId) : undefined,
          ilikeAny(q.q, sql`${stops.name}`, sql`coalesce(${stops.neighbourhood}, '')`, sql`coalesce(${stops.landmark}, '')`),
        ),
      )
      .limit(200);
    const { lat, lng } = q;
    if (lat === undefined || lng === undefined) return rows.sort((a, b) => a.name.localeCompare(b.name, "pt")).slice(0, 50);
    return rows
      .map((s) => ({ ...s, distanceMeters: distanceMeters(lat, lng, s.lat, s.lng) }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 50);
  });

  app.get("/routes", async (request) => {
    const q = parse(
      z.object({ universityId: z.string().uuid().optional(), stopId: z.string().uuid().optional(), serviceType: z.enum(ROUTE_SERVICE_TYPES).optional() }),
      request.query,
    );
    const rows = await db
      .select({
        id: routes.id,
        code: routes.code,
        name: routes.name,
        description: routes.description,
        direction: routes.direction,
        serviceType: routes.serviceType,
        isDemo: routes.isDemo,
      })
      .from(routes)
      .where(
        and(
          eq(routes.status, "active"),
          q.serviceType ? eq(routes.serviceType, q.serviceType) : undefined,
          q.universityId
            ? sql`exists (select 1 from ${routeUniversities} where ${routeUniversities.routeId} = ${routes.id} and ${routeUniversities.universityId} = ${q.universityId})`
            : undefined,
          q.stopId
            ? sql`exists (select 1 from ${routeStops} where ${routeStops.routeId} = ${routes.id} and ${routeStops.stopId} = ${q.stopId})`
            : undefined,
        ),
      )
      .orderBy(asc(routes.code));
    if (rows.length === 0) return [];
    const unis = await db
      .select({ routeId: routeUniversities.routeId, shortName: universities.shortName })
      .from(routeUniversities)
      .innerJoin(universities, eq(universities.id, routeUniversities.universityId))
      .where(inArray(routeUniversities.routeId, rows.map((r) => r.id)));
    return rows.map((r) => ({ ...r, universities: unis.filter((u) => u.routeId === r.id).map((u) => u.shortName) }));
  });

  app.get("/routes/:id", async (request) => {
    const { id } = parse(uuidParam, request.params);
    const detail = await loadRouteDetail(db, id);
    if (detail.status !== "active") throw notFound("Rota não encontrada.");
    return {
      ...detail,
      stops: detail.stops.filter((s) => s.active),
      schedules: detail.schedules.filter((s) => s.active),
    };
  });

  app.get("/routes/:id/trips", async (request) => {
    const { id } = parse(uuidParam, request.params);
    const q = parse(z.object({ date: dateSchema.optional() }), request.query);
    const date = q.date ?? localDate(app.ctx.now());
    const rows = await db
      .select({ id: trips.id, serviceDate: trips.serviceDate, departureTime: trips.departureTime, status: trips.status, capacity: trips.capacity, taken: seatsTaken })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .where(and(eq(trips.routeId, id), eq(routes.status, "active"), eq(trips.serviceDate, date), inArray(trips.status, ["scheduled", "in_progress"])))
      .orderBy(asc(trips.departureTime));
    return rows.map(({ taken, ...t }) => ({ ...t, seatsAvailable: Math.max(0, t.capacity - taken) }));
  });

  // ------------------------------------------------------------ Verificação universitária
  app.get("/verifications/me", { preHandler: can("student.self") }, async (request) =>
    db
      .select({
        id: studentVerifications.id,
        status: studentVerifications.status,
        studentNumber: studentVerifications.studentNumber,
        decisionNote: studentVerifications.decisionNote,
        createdAt: studentVerifications.createdAt,
        decidedAt: studentVerifications.decidedAt,
        universityShortName: universities.shortName,
      })
      .from(studentVerifications)
      .innerJoin(universities, eq(universities.id, studentVerifications.universityId))
      .where(eq(studentVerifications.userId, request.auth!.userId))
      .orderBy(desc(studentVerifications.createdAt))
      .limit(10),
  );

  app.post("/verifications", { preHandler: can("student.self") }, async (request, reply) => {
    const body = parse(VerificationCreate, request.body);
    const userId = request.auth!.userId;
    const created = await db.transaction(async (tx) => {
      const [uni] = await tx.select({ active: universities.active }).from(universities).where(eq(universities.id, body.universityId));
      if (!uni?.active) throw badRequest("Universidade inválida.");
      const [profile] = await tx.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).for("update");
      if (profile?.verificationStatus === "approved" && profile.universityId === body.universityId) {
        throw badRequest("A sua inscrição nesta universidade já está confirmada.");
      }
      const [v] = await tx
        .insert(studentVerifications)
        .values({ userId, universityId: body.universityId, studentNumber: body.studentNumber, documentNote: body.documentNote ?? null })
        .returning({ id: studentVerifications.id, status: studentVerifications.status });
      // A universidade indicada só passa a contar depois de aprovada por um gestor.
      await tx.update(studentProfiles).set({ verificationStatus: "pending", updatedAt: app.ctx.now() }).where(eq(studentProfiles.userId, userId));
      await audit(tx, request, { action: "verification.submit", entityType: "student_verification", entityId: v!.id });
      return v!;
    });
    return reply.status(201).send(created);
  });

  // ------------------------------------------------------------ Reservas
  app.get("/bookings/me", { preHandler: can("student.self") }, async (request) => {
    const since = addDays(localDate(app.ctx.now()), -14);
    return db
      .select({
        id: bookings.id,
        status: bookings.status,
        seatNumber: bookings.seatNumber,
        createdAt: bookings.createdAt,
        tripId: trips.id,
        serviceDate: trips.serviceDate,
        departureTime: trips.departureTime,
        tripStatus: trips.status,
        routeCode: routes.code,
        routeName: routes.name,
        direction: routes.direction,
        stopName: stops.name,
        minutesFromStart: routeStops.minutesFromStart,
      })
      .from(bookings)
      .innerJoin(trips, eq(trips.id, bookings.tripId))
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(stops, eq(stops.id, bookings.stopId))
      .leftJoin(routeStops, and(eq(routeStops.routeId, trips.routeId), eq(routeStops.stopId, bookings.stopId)))
      .where(and(eq(bookings.studentId, request.auth!.userId), gte(trips.serviceDate, since)))
      .orderBy(desc(trips.serviceDate), desc(trips.departureTime))
      .limit(50);
  });

  app.post("/bookings", { preHandler: can("student.self") }, async (request, reply) => {
    const body = parse(BookingCreate, request.body);
    const studentId = request.auth!.userId;
    const now = app.ctx.now();
    const settings = await loadSettings(db);

    const booking = await db.transaction(async (tx) => {
      // O bloqueio da viagem serializa as reservas concorrentes; os índices únicos são a última barreira.
      const [trip] = await tx.select().from(trips).where(eq(trips.id, body.tripId)).for("update");
      if (!trip) throw notFound("Viagem não encontrada.");
      if (trip.status !== "scheduled") throw badRequest("Esta viagem já não aceita reservas.");
      const minutes = minutesUntil(now, trip.serviceDate, trip.departureTime);
      if (minutes <= 0) throw badRequest("Esta viagem já partiu.");
      if (trip.serviceDate > addDays(localDate(now), settings.bookingHorizonDays)) {
        throw badRequest(`Só é possível reservar com até ${settings.bookingHorizonDays} dias de antecedência.`);
      }

      const [route] = await tx.select().from(routes).where(eq(routes.id, trip.routeId));
      if (route?.status !== "active") throw badRequest("A rota desta viagem não está activa.");

      const [profile] = await tx.select().from(studentProfiles).where(eq(studentProfiles.userId, studentId));
      if (profile?.verificationStatus !== "approved") {
        throw forbidden("A sua inscrição universitária ainda não foi confirmada.");
      }
      const current = await currentSubscription(tx, studentId, now);
      if (!current || current.effectiveStatus !== "active") throw forbidden("Precisa de uma subscrição activa para reservar.");
      const coverage = await routeCoverage(tx, current, route);
      if (!coverage.covered) throw forbidden(coverage.reason);

      const [stop] = await tx
        .select({ kind: stops.kind, active: stops.active, position: routeStops.position })
        .from(routeStops)
        .innerJoin(stops, eq(stops.id, routeStops.stopId))
        .where(and(eq(routeStops.routeId, route.id), eq(routeStops.stopId, body.stopId)));
      if (!stop?.active) throw badRequest("A paragem indicada não pertence a esta rota.");
      if (stop.kind === "destination") throw badRequest("Escolha a paragem onde vai entrar ou sair, não a universidade.");
      if (route.serviceType === "intercity") {
        const [{ last } = { last: 0 }] = await tx
          .select({ last: sql<number>`max(${routeStops.position})::int` })
          .from(routeStops)
          .where(eq(routeStops.routeId, route.id));
        if (stop.position === last) throw badRequest("Escolha a paragem onde vai embarcar; a última paragem é o destino.");
        const allowance = await lockIntercityAllowance(tx, current, studentId);
        if (allowance.used >= allowance.limit) {
          throw conflict(`Já utilizou as ${allowance.limit} viagens intercidades incluídas no período do seu plano.`, "intercity_limit");
        }
      }

      const [{ n: todayCount } = { n: 0 }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(and(eq(bookings.studentId, studentId), eq(trips.serviceDate, trip.serviceDate), inArray(bookings.status, ["confirmed", "boarded"])));
      if (todayCount >= current.plan.maxBookingsPerDay) {
        throw conflict(`O seu plano permite ${current.plan.maxBookingsPerDay} reservas por dia.`, "booking_limit");
      }

      const taken = await tx
        .select({ seat: bookings.seatNumber, studentId: bookings.studentId })
        .from(bookings)
        .where(and(eq(bookings.tripId, trip.id), inArray(bookings.status, ["confirmed", "boarded"])));
      if (taken.some((b) => b.studentId === studentId)) throw conflict("Já tem uma reserva confirmada nesta viagem.", "duplicate_booking");
      const used = new Set(taken.map((b) => b.seat));
      let seat = 0;
      for (let i = 1; i <= trip.capacity; i++) {
        if (!used.has(i)) {
          seat = i;
          break;
        }
      }
      if (seat === 0) throw conflict("Esta viagem está lotada.", "trip_full");

      const [created] = await tx
        .insert(bookings)
        .values({ tripId: trip.id, studentId, stopId: body.stopId, seatNumber: seat })
        .returning();
      await audit(tx, request, { action: "booking.create", entityType: "booking", entityId: created!.id, details: { tripId: trip.id } });
      return created!;
    });
    return reply.status(201).send(booking);
  });

  app.post("/bookings/:id/cancel", { preHandler: can("student.self") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const settings = await loadSettings(db);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ booking: bookings, trip: trips })
        .from(bookings)
        .innerJoin(trips, eq(trips.id, bookings.tripId))
        .where(and(eq(bookings.id, id), eq(bookings.studentId, request.auth!.userId)))
        .for("update", { of: bookings });
      if (!row) throw notFound("Reserva não encontrada.");
      if (row.booking.status !== "confirmed") throw badRequest("Esta reserva já não pode ser cancelada.");
      if (row.trip.status !== "scheduled") throw badRequest("A viagem já começou.");
      if (minutesUntil(app.ctx.now(), row.trip.serviceDate, row.trip.departureTime) < settings.bookingCancelCutoffMinutes) {
        throw badRequest(`Só é possível cancelar até ${settings.bookingCancelCutoffMinutes} minutos antes da partida.`);
      }
      const [updated] = await tx
        .update(bookings)
        .set({ status: "cancelled", cancelledAt: app.ctx.now() })
        .where(eq(bookings.id, id))
        .returning({ id: bookings.id, status: bookings.status });
      await audit(tx, request, { action: "booking.cancel", entityType: "booking", entityId: id });
      return updated;
    });
  });

  // ------------------------------------------------------------ Acompanhamento da viagem
  app.get("/trips/:id/live", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const auth = request.auth!;
    const [trip] = await db
      .select({ id: trips.id, status: trips.status, serviceDate: trips.serviceDate, departureTime: trips.departureTime, routeId: trips.routeId, startedAt: trips.startedAt })
      .from(trips)
      .where(eq(trips.id, id));
    if (!trip) throw notFound("Viagem não encontrada.");

    let myStopId: string | null = null;
    if (!hasPermission(auth.role, "trips.read")) {
      const [booking] = await db
        .select({ stopId: bookings.stopId })
        .from(bookings)
        .where(and(eq(bookings.tripId, id), eq(bookings.studentId, auth.userId), inArray(bookings.status, ["confirmed", "boarded"])));
      if (!booking) throw forbidden("Só pode acompanhar viagens em que tem reserva.");
      myStopId = booking.stopId;
    }

    let plannedAtMyStop: string | null = null;
    let myStop: { lat: number; lng: number; name: string } | null = null;
    if (myStopId) {
      const [rs] = await db
        .select({ minutes: routeStops.minutesFromStart, lat: stops.lat, lng: stops.lng, name: stops.name })
        .from(routeStops)
        .innerJoin(stops, eq(stops.id, routeStops.stopId))
        .where(and(eq(routeStops.routeId, trip.routeId), eq(routeStops.stopId, myStopId)));
      if (rs) {
        plannedAtMyStop = timePlusMinutes(trip.departureTime, rs.minutes);
        myStop = { lat: rs.lat, lng: rs.lng, name: rs.name };
      }
    }

    // A localização só é partilhada durante a viagem autorizada.
    const location = trip.status === "in_progress" ? await latestLocation(db, id) : null;
    return {
      tripId: trip.id,
      status: trip.status,
      serviceDate: trip.serviceDate,
      departureTime: trip.departureTime,
      startedAt: trip.startedAt,
      location,
      myStop: myStop && {
        name: myStop.name,
        plannedTime: plannedAtMyStop,
        distanceMeters: location ? distanceMeters(location.lat, location.lng, myStop.lat, myStop.lng) : null,
      },
      note: "A hora indicada é a prevista no horário; não é uma estimativa calculada com base no trânsito.",
    };
  });
}
