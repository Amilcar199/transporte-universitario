import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { TRIP_STATUSES } from "@uni/shared";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import { bookings, drivers, routes, schedules, stops, trips, users, vehicleLocations, vehicles } from "../db/schema.ts";
import { badRequest, notFound, parse } from "../errors.ts";
import { dateSchema, isoWeekday, localDate, notify, PageQuery, qualified, timeSchema, uuidParam } from "../lib.ts";

const TripCreate = z.object({
  routeId: z.string().uuid(),
  scheduleId: z.string().uuid().nullable().optional(),
  serviceDate: dateSchema,
  departureTime: timeSchema.optional(),
  vehicleId: z.string().uuid(),
  driverId: z.string().uuid(),
});

const TripUpdate = z.object({
  vehicleId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  status: z.literal("cancelled").optional(),
  cancelReason: z.string().trim().min(3, "Indique o motivo.").max(300).optional(),
});

export const tripListColumns = {
  id: trips.id,
  serviceDate: trips.serviceDate,
  departureTime: trips.departureTime,
  status: trips.status,
  capacity: trips.capacity,
  routeId: routes.id,
  routeCode: routes.code,
  routeName: routes.name,
  direction: routes.direction,
  vehicleId: vehicles.id,
  vehiclePlate: vehicles.plate,
  vehicleModel: vehicles.model,
  driverId: users.id,
  driverName: users.fullName,
  booked: sql<number>`(select count(*)::int from ${bookings} where ${qualified(bookings.tripId)} = ${qualified(trips.id)} and ${qualified(bookings.status)} in ('confirmed', 'boarded'))`,
};

export async function loadTripManifest(db: DbOrTx, tripId: string) {
  return db
    .select({
      bookingId: bookings.id,
      seatNumber: bookings.seatNumber,
      status: bookings.status,
      studentName: users.fullName,
      stopId: stops.id,
      stopName: stops.name,
      boardedAt: bookings.boardedAt,
    })
    .from(bookings)
    .innerJoin(users, eq(users.id, bookings.studentId))
    .innerJoin(stops, eq(stops.id, bookings.stopId))
    .where(and(eq(bookings.tripId, tripId), inArray(bookings.status, ["confirmed", "boarded", "no_show"])))
    .orderBy(asc(bookings.seatNumber));
}

export async function latestLocation(db: DbOrTx, tripId: string) {
  const [row] = await db
    .select({
      lat: vehicleLocations.lat,
      lng: vehicleLocations.lng,
      speedMps: vehicleLocations.speedMps,
      heading: vehicleLocations.heading,
      recordedAt: vehicleLocations.recordedAt,
    })
    .from(vehicleLocations)
    .where(eq(vehicleLocations.tripId, tripId))
    .orderBy(desc(vehicleLocations.recordedAt))
    .limit(1);
  return row ?? null;
}

async function assertAssignable(db: DbOrTx, vehicleId: string | undefined, driverId: string | undefined) {
  let capacity: number | undefined;
  if (vehicleId) {
    const [vehicle] = await db.select().from(vehicles).where(eq(vehicles.id, vehicleId));
    if (!vehicle) throw notFound("Veículo não encontrado.");
    if (vehicle.status !== "active") throw badRequest("O veículo não está operacional.");
    capacity = vehicle.capacity;
  }
  if (driverId) {
    const [driver] = await db
      .select({ status: users.status })
      .from(drivers)
      .innerJoin(users, eq(users.id, drivers.userId))
      .where(eq(drivers.userId, driverId));
    if (!driver) throw notFound("Motorista não encontrado.");
    if (driver.status !== "active") throw badRequest("O motorista está desactivado.");
  }
  return { capacity };
}

export async function adminTripRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  app.get("/admin/trips", { preHandler: can("trips.read") }, async (request) => {
    const q = parse(
      PageQuery.extend({
        date: dateSchema.optional(),
        routeId: z.string().uuid().optional(),
        status: z.enum(TRIP_STATUSES).optional(),
      }),
      request.query,
    );
    const where = and(
      q.date ? eq(trips.serviceDate, q.date) : undefined,
      q.routeId ? eq(trips.routeId, q.routeId) : undefined,
      q.status ? eq(trips.status, q.status) : undefined,
    );
    const [items, total] = await Promise.all([
      db
        .select(tripListColumns)
        .from(trips)
        .innerJoin(routes, eq(routes.id, trips.routeId))
        .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
        .innerJoin(users, eq(users.id, trips.driverId))
        .where(where)
        .orderBy(desc(trips.serviceDate), asc(trips.departureTime))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(trips, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/admin/trips/:id", { preHandler: can("trips.read") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const [trip] = await db
      .select({ ...tripListColumns, startedAt: trips.startedAt, finishedAt: trips.finishedAt, cancelReason: trips.cancelReason })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .innerJoin(users, eq(users.id, trips.driverId))
      .where(eq(trips.id, id));
    if (!trip) throw notFound("Viagem não encontrada.");
    const [manifest, lastLocation] = await Promise.all([loadTripManifest(db, id), latestLocation(db, id)]);
    return { ...trip, manifest, lastLocation };
  });

  app.post("/admin/trips", { preHandler: can("trips.write") }, async (request, reply) => {
    const body = parse(TripCreate, request.body);
    if (body.serviceDate < localDate(app.ctx.now())) throw badRequest("Não é possível atribuir viagens a datas passadas.");

    const id = await db.transaction(async (tx) => {
      const [route] = await tx.select().from(routes).where(eq(routes.id, body.routeId));
      if (!route) throw notFound("Rota não encontrada.");
      if (route.status !== "active") throw badRequest("A rota tem de estar activa para receber viagens.");

      let departureTime = body.departureTime;
      if (body.scheduleId) {
        const [schedule] = await tx.select().from(schedules).where(eq(schedules.id, body.scheduleId));
        if (!schedule || schedule.routeId !== route.id) throw badRequest("O horário não pertence a esta rota.");
        if (!schedule.active) throw badRequest("O horário está inactivo.");
        if (!schedule.daysOfWeek.includes(isoWeekday(body.serviceDate))) {
          throw badRequest("O horário não opera no dia da semana seleccionado.");
        }
        if ((schedule.validFrom && body.serviceDate < schedule.validFrom) || (schedule.validTo && body.serviceDate > schedule.validTo)) {
          throw badRequest("A data está fora do período de validade do horário.");
        }
        departureTime = schedule.departureTime;
      }
      if (!departureTime) throw badRequest("Indique o horário ou a hora de partida.", { fields: { departureTime: "Obrigatório." } });

      const { capacity } = await assertAssignable(tx, body.vehicleId, body.driverId);
      const [created] = await tx
        .insert(trips)
        .values({
          routeId: route.id,
          scheduleId: body.scheduleId ?? null,
          serviceDate: body.serviceDate,
          departureTime,
          vehicleId: body.vehicleId,
          driverId: body.driverId,
          capacity: capacity!,
        })
        .returning({ id: trips.id });
      await audit(tx, request, {
        action: "trip.assign",
        entityType: "trip",
        entityId: created!.id,
        details: { routeId: route.id, serviceDate: body.serviceDate, departureTime, vehicleId: body.vehicleId, driverId: body.driverId },
      });
      return created!.id;
    });
    const [trip] = await db
      .select(tripListColumns)
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .innerJoin(users, eq(users.id, trips.driverId))
      .where(eq(trips.id, id));
    return reply.status(201).send(trip);
  });

  app.patch("/admin/trips/:id", { preHandler: can("trips.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(TripUpdate, request.body);
    await db.transaction(async (tx) => {
      const [trip] = await tx.select().from(trips).where(eq(trips.id, id)).for("update");
      if (!trip) throw notFound("Viagem não encontrada.");
      if (trip.status !== "scheduled") throw badRequest("Só é possível alterar viagens ainda agendadas.");

      if (body.status === "cancelled") {
        if (!body.cancelReason) throw badRequest("Indique o motivo do cancelamento.", { fields: { cancelReason: "Obrigatório." } });
        await tx
          .update(trips)
          .set({ status: "cancelled", cancelReason: body.cancelReason, updatedAt: app.ctx.now() })
          .where(eq(trips.id, id));
        const affected = await tx
          .update(bookings)
          .set({ status: "cancelled", cancelledAt: app.ctx.now() })
          .where(and(eq(bookings.tripId, id), eq(bookings.status, "confirmed")))
          .returning({ studentId: bookings.studentId });
        for (const b of affected) {
          await notify(tx, {
            userId: b.studentId,
            title: "Viagem cancelada",
            body: `A viagem de ${trip.serviceDate} às ${trip.departureTime} foi cancelada: ${body.cancelReason}`,
            kind: "trip_cancelled",
            dedupeKey: `trip_cancelled:${id}`,
          });
        }
        await audit(tx, request, {
          action: "trip.cancel",
          entityType: "trip",
          entityId: id,
          details: { reason: body.cancelReason, bookingsCancelled: affected.length },
        });
        return;
      }

      const { capacity } = await assertAssignable(tx, body.vehicleId, body.driverId);
      if (capacity !== undefined) {
        const [{ n } = { n: 0 }] = await tx
          .select({ n: sql<number>`coalesce(max(${bookings.seatNumber}), 0)::int` })
          .from(bookings)
          .where(and(eq(bookings.tripId, id), inArray(bookings.status, ["confirmed", "boarded"])));
        if (n > capacity) throw badRequest(`O novo veículo tem ${capacity} lugares, mas já existem reservas até ao lugar ${n}.`);
      }
      await tx
        .update(trips)
        .set({ vehicleId: body.vehicleId, driverId: body.driverId, capacity, updatedAt: app.ctx.now() })
        .where(eq(trips.id, id));
      await audit(tx, request, { action: "trip.reassign", entityType: "trip", entityId: id, details: { fields: Object.keys(body) } });
    });
    const [trip] = await db
      .select(tripListColumns)
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .innerJoin(users, eq(users.id, trips.driverId))
      .where(eq(trips.id, id));
    return trip;
  });
}
