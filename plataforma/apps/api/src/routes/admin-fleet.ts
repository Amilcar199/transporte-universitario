import { and, asc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { VEHICLE_STATUSES } from "@uni/shared";
import { audit } from "../audit.ts";
import { hashPassword } from "../auth/crypto.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import { drivers, sessions, users, vehicles } from "../db/schema.ts";
import { notFound, parse } from "../errors.ts";
import { ilikeAny, PageQuery, uuidParam } from "../lib.ts";
import { emailSchema, passwordSchema, phoneSchema } from "./auth.ts";

const VehicleInput = z.object({
  plate: z
    .string()
    .trim()
    .min(4, "Indique a matrícula.")
    .max(20)
    .transform((v) => v.toUpperCase()),
  model: z.string().trim().min(2, "Indique o modelo.").max(80),
  capacity: z.coerce.number().int().min(1, "Capacidade mínima: 1.").max(100, "Capacidade máxima: 100."),
  status: z.enum(VEHICLE_STATUSES).optional(),
  carrierId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

const DriverCreate = z.object({
  fullName: z.string().trim().min(3, "Indique o nome completo.").max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  temporaryPassword: passwordSchema,
  licenceNumber: z.string().trim().min(4, "Indique o número da carta.").max(30),
  defaultVehicleId: z.string().uuid().nullable().optional(),
});

const DriverUpdate = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  phone: phoneSchema.optional(),
  licenceNumber: z.string().trim().min(4).max(30).optional(),
  defaultVehicleId: z.string().uuid().nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const driverColumns = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  status: users.status,
  isDemo: users.isDemo,
  licenceNumber: drivers.licenceNumber,
  defaultVehicleId: drivers.defaultVehicleId,
  defaultVehiclePlate: vehicles.plate,
};

async function loadDriver(db: DbOrTx, id: string) {
  const [row] = await db
    .select(driverColumns)
    .from(drivers)
    .innerJoin(users, eq(users.id, drivers.userId))
    .leftJoin(vehicles, eq(vehicles.id, drivers.defaultVehicleId))
    .where(eq(drivers.userId, id));
  if (!row) throw notFound("Motorista não encontrado.");
  return row;
}

export async function adminFleetRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  // ------------------------------------------------------------ Veículos
  app.get("/admin/vehicles", { preHandler: can("fleet.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(VEHICLE_STATUSES).optional() }), request.query);
    const where = and(
      ilikeAny(q.search, sql`${vehicles.plate}`, sql`${vehicles.model}`),
      q.status ? eq(vehicles.status, q.status) : undefined,
    );
    const [items, total] = await Promise.all([
      db.select().from(vehicles).where(where).orderBy(asc(vehicles.plate)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      db.$count(vehicles, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/vehicles", { preHandler: can("fleet.write") }, async (request, reply) => {
    const body = parse(VehicleInput, request.body);
    const [created] = await db.insert(vehicles).values(body).returning();
    await audit(db, request, { action: "vehicle.create", entityType: "vehicle", entityId: created!.id, details: { plate: body.plate } });
    return reply.status(201).send(created);
  });

  app.patch("/admin/vehicles/:id", { preHandler: can("fleet.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(VehicleInput.partial(), request.body);
    const [updated] = await db.update(vehicles).set({ ...body, updatedAt: app.ctx.now() }).where(eq(vehicles.id, id)).returning();
    if (!updated) throw notFound("Veículo não encontrado.");
    await audit(db, request, { action: "vehicle.update", entityType: "vehicle", entityId: id, details: { fields: Object.keys(body) } });
    return updated;
  });

  // ------------------------------------------------------------ Motoristas
  app.get("/admin/drivers", { preHandler: can("fleet.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(["active", "disabled"]).optional() }), request.query);
    const where = and(
      ilikeAny(q.search, sql`${users.fullName}`, sql`${users.email}`, sql`${drivers.licenceNumber}`),
      q.status ? eq(users.status, q.status) : undefined,
    );
    const [items, totalRows] = await Promise.all([
      db
        .select(driverColumns)
        .from(drivers)
        .innerJoin(users, eq(users.id, drivers.userId))
        .leftJoin(vehicles, eq(vehicles.id, drivers.defaultVehicleId))
        .where(where)
        .orderBy(asc(users.fullName))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ n: sql<number>`count(*)::int` }).from(drivers).innerJoin(users, eq(users.id, drivers.userId)).where(where),
    ]);
    return { items, total: totalRows[0]?.n ?? 0, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/drivers", { preHandler: can("fleet.write") }, async (request, reply) => {
    const body = parse(DriverCreate, request.body);
    const passwordHash = await hashPassword(body.temporaryPassword);
    const id = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: body.email, phone: body.phone, fullName: body.fullName, passwordHash, role: "driver" })
        .returning({ id: users.id });
      await tx.insert(drivers).values({
        userId: user!.id,
        licenceNumber: body.licenceNumber,
        defaultVehicleId: body.defaultVehicleId ?? null,
      });
      await audit(tx, request, { action: "driver.create", entityType: "driver", entityId: user!.id, details: { email: body.email } });
      return user!.id;
    });
    return reply.status(201).send(await loadDriver(db, id));
  });

  app.patch("/admin/drivers/:id", { preHandler: can("fleet.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(DriverUpdate, request.body);
    await db.transaction(async (tx) => {
      await loadDriver(tx, id);
      const userFields = { fullName: body.fullName, phone: body.phone, status: body.status };
      if (Object.values(userFields).some((v) => v !== undefined)) {
        await tx.update(users).set({ ...userFields, updatedAt: app.ctx.now() }).where(eq(users.id, id));
      }
      if (body.licenceNumber !== undefined || body.defaultVehicleId !== undefined) {
        await tx
          .update(drivers)
          .set({ licenceNumber: body.licenceNumber, defaultVehicleId: body.defaultVehicleId, updatedAt: app.ctx.now() })
          .where(eq(drivers.userId, id));
      }
      if (body.status === "disabled") {
        await tx.update(sessions).set({ revokedAt: app.ctx.now() }).where(eq(sessions.userId, id));
      }
      await audit(tx, request, { action: "driver.update", entityType: "driver", entityId: id, details: { fields: Object.keys(body) } });
    });
    return loadDriver(db, id);
  });
}
