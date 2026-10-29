import { asc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import { partnerCarriers, partnerValidators, vehicles } from "../db/schema.ts";
import { notFound, parse } from "../errors.ts";
import { qualified, uuidParam } from "../lib.ts";
import { emailSchema, phoneSchema } from "./auth.ts";

const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable().optional());

const CarrierInput = z.object({
  name: z.string().trim().min(2, "Indique o nome da transportadora.").max(160),
  nif: optional(z.string().trim().regex(/^[0-9A-Za-z]{6,20}$/, "NIF inválido.")),
  contactEmail: optional(emailSchema),
  contactPhone: optional(phoneSchema),
  active: z.boolean().optional(),
});

/**
 * Transportadoras parceiras. Só devem ser registadas empresas com acordo efectivo; os registos de demonstração
 * ficam marcados como tal e nunca são apresentados como parceiros reais.
 */
export async function adminPartnerRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  app.get("/admin/partners", { preHandler: can("partners.read") }, async () =>
    db
      .select({
        id: partnerCarriers.id,
        name: partnerCarriers.name,
        nif: partnerCarriers.nif,
        contactEmail: partnerCarriers.contactEmail,
        contactPhone: partnerCarriers.contactPhone,
        active: partnerCarriers.active,
        isDemo: partnerCarriers.isDemo,
        createdAt: partnerCarriers.createdAt,
        vehicleCount: sql<number>`(select count(*)::int from ${vehicles} where ${qualified(vehicles.carrierId)} = ${qualified(partnerCarriers.id)})`,
        validatorCount: sql<number>`(select count(*)::int from ${partnerValidators} where ${qualified(partnerValidators.carrierId)} = ${qualified(partnerCarriers.id)})`,
      })
      .from(partnerCarriers)
      .orderBy(asc(partnerCarriers.name)),
  );

  app.post("/admin/partners", { preHandler: can("partners.write") }, async (request, reply) => {
    const body = parse(CarrierInput, request.body);
    const [created] = await db.insert(partnerCarriers).values(body).returning();
    await audit(db, request, { action: "partner.create", entityType: "partner_carrier", entityId: created!.id });
    return reply.status(201).send(created);
  });

  app.patch("/admin/partners/:id", { preHandler: can("partners.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(CarrierInput.partial(), request.body);
    const [updated] = await db.update(partnerCarriers).set(body).where(eq(partnerCarriers.id, id)).returning();
    if (!updated) throw notFound("Transportadora não encontrada.");
    await audit(db, request, { action: "partner.update", entityType: "partner_carrier", entityId: id, details: { fields: Object.keys(body) } });
    return updated;
  });
}
