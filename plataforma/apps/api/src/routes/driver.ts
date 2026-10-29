import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import { bookings, routes, trips, vehicleLocations, vehicles } from "../db/schema.ts";
import { badRequest, forbidden, notFound, parse } from "../errors.ts";
import { addDays, localDate, localTime, minutesOf, notify, uuidParam } from "../lib.ts";
import { loadRouteDetail } from "./admin-network.ts";
import { loadTripManifest } from "./admin-trips.ts";

/** Quanto tempo antes da hora marcada o motorista pode iniciar a viagem. */
const START_WINDOW_MINUTES = 60;

const LocationBatch = z.object({
  points: z
    .array(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        accuracyM: z.number().min(0).max(10_000).optional(),
        speedMps: z.number().min(0).max(100).optional(),
        heading: z.number().min(0).max(360).optional(),
        recordedAt: z.coerce.date(),
      }),
    )
    .min(1)
    .max(50),
});

async function loadOwnTrip(db: DbOrTx, tripId: string, driverId: string, lock = false) {
  const query = db.select().from(trips).where(eq(trips.id, tripId));
  const [trip] = lock ? await query.for("update") : await query;
  if (!trip) throw notFound("Viagem não encontrada.");
  if (trip.driverId !== driverId) throw forbidden("Esta viagem não lhe está atribuída.");
  return trip;
}

export async function driverRoutes(app: FastifyInstance) {
  const { db } = app.ctx;
  const guard = { preHandler: can("driver.operate") };

  app.get("/driver/trips", guard, async (request) => {
    const today = localDate(app.ctx.now());
    return db
      .select({
        id: trips.id,
        serviceDate: trips.serviceDate,
        departureTime: trips.departureTime,
        status: trips.status,
        capacity: trips.capacity,
        routeCode: routes.code,
        routeName: routes.name,
        direction: routes.direction,
        vehiclePlate: vehicles.plate,
        vehicleModel: vehicles.model,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(
        and(
          eq(trips.driverId, request.auth!.userId),
          gte(trips.serviceDate, addDays(today, -1)),
          lte(trips.serviceDate, addDays(today, 7)),
          inArray(trips.status, ["scheduled", "in_progress", "completed"]),
        ),
      )
      .orderBy(asc(trips.serviceDate), asc(trips.departureTime));
  });

  app.get("/driver/trips/:id", guard, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const trip = await loadOwnTrip(db, id, request.auth!.userId);
    const [route, manifest, [vehicle]] = await Promise.all([
      loadRouteDetail(db, trip.routeId),
      loadTripManifest(db, id),
      db.select({ plate: vehicles.plate, model: vehicles.model }).from(vehicles).where(eq(vehicles.id, trip.vehicleId)),
    ]);
    // O manifesto contém apenas nome, lugar, paragem e estado; sem contactos nem dados financeiros.
    return {
      id: trip.id,
      serviceDate: trip.serviceDate,
      departureTime: trip.departureTime,
      status: trip.status,
      capacity: trip.capacity,
      startedAt: trip.startedAt,
      finishedAt: trip.finishedAt,
      vehicle,
      route: { id: route.id, code: route.code, name: route.name, direction: route.direction, stops: route.stops },
      manifest,
    };
  });

  app.post("/driver/trips/:id/start", guard, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const now = app.ctx.now();
    return db.transaction(async (tx) => {
      const trip = await loadOwnTrip(tx, id, request.auth!.userId, true);
      if (trip.status !== "scheduled") throw badRequest("Só é possível iniciar uma viagem agendada.");
      if (trip.serviceDate !== localDate(now)) throw badRequest("Só é possível iniciar viagens do dia de hoje.");
      if (minutesOf(trip.departureTime) - minutesOf(localTime(now)) > START_WINDOW_MINUTES) {
        throw badRequest(`Só pode iniciar a viagem até ${START_WINDOW_MINUTES} minutos antes da hora marcada.`);
      }
      const [updated] = await tx
        .update(trips)
        .set({ status: "in_progress", startedAt: now, updatedAt: now })
        .where(eq(trips.id, id))
        .returning({ id: trips.id, status: trips.status, startedAt: trips.startedAt });
      const passengers = await tx
        .select({ studentId: bookings.studentId })
        .from(bookings)
        .where(and(eq(bookings.tripId, id), eq(bookings.status, "confirmed")));
      for (const p of passengers) {
        await notify(tx, {
          userId: p.studentId,
          title: "A sua viagem começou",
          body: `O autocarro das ${trip.departureTime} já está a caminho.`,
          kind: "trip_started",
          dedupeKey: `trip_started:${id}`,
        });
      }
      await audit(tx, request, { action: "trip.start", entityType: "trip", entityId: id });
      return updated;
    });
  });

  app.post("/driver/trips/:id/finish", guard, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const now = app.ctx.now();
    return db.transaction(async (tx) => {
      const trip = await loadOwnTrip(tx, id, request.auth!.userId, true);
      if (trip.status !== "in_progress") throw badRequest("Só é possível terminar uma viagem em circulação.");
      const [updated] = await tx
        .update(trips)
        .set({ status: "completed", finishedAt: now, updatedAt: now })
        .where(eq(trips.id, id))
        .returning({ id: trips.id, status: trips.status, finishedAt: trips.finishedAt });
      const noShows = await tx
        .update(bookings)
        .set({ status: "no_show" })
        .where(and(eq(bookings.tripId, id), eq(bookings.status, "confirmed")))
        .returning({ id: bookings.id });
      await audit(tx, request, { action: "trip.finish", entityType: "trip", entityId: id, details: { noShows: noShows.length } });
      return { ...updated, noShows: noShows.length };
    });
  });

  app.post("/driver/trips/:id/locations", guard, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(LocationBatch, request.body);
    const driverId = request.auth!.userId;
    const trip = await loadOwnTrip(db, id, driverId);
    // A localização só é aceite durante uma viagem autorizada e em curso.
    if (trip.status !== "in_progress" || !trip.startedAt) throw badRequest("A localização só é enviada durante a viagem.");
    const now = app.ctx.now();
    const earliest = trip.startedAt.getTime() - 60_000;
    const latest = now.getTime() + 60_000;
    const points = body.points.filter((p) => p.recordedAt.getTime() >= earliest && p.recordedAt.getTime() <= latest);
    if (points.length > 0) {
      await db.insert(vehicleLocations).values(
        points.map((p) => ({
          tripId: id,
          driverId,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM ?? null,
          speedMps: p.speedMps ?? null,
          heading: p.heading ?? null,
          recordedAt: p.recordedAt,
        })),
      );
    }
    return { accepted: points.length, rejected: body.points.length - points.length };
  });

  app.post("/driver/trips/:id/bookings/:bookingId/board", guard, async (request) => {
    const params = parse(z.object({ id: z.string().uuid(), bookingId: z.string().uuid() }), request.params);
    return db.transaction(async (tx) => {
      const trip = await loadOwnTrip(tx, params.id, request.auth!.userId);
      if (trip.status !== "in_progress") throw badRequest("Inicie a viagem antes de registar embarques.");
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, params.bookingId), eq(bookings.tripId, trip.id)))
        .for("update");
      if (!booking) throw notFound("Reserva não encontrada nesta viagem.");
      if (booking.status === "boarded") return { id: booking.id, status: booking.status };
      if (booking.status !== "confirmed") throw badRequest("Esta reserva não está confirmada.");
      const [updated] = await tx
        .update(bookings)
        .set({ status: "boarded", boardedAt: app.ctx.now() })
        .where(eq(bookings.id, booking.id))
        .returning({ id: bookings.id, status: bookings.status });
      await audit(tx, request, { action: "booking.board", entityType: "booking", entityId: booking.id, details: { tripId: trip.id } });
      return updated;
    });
  });
}
