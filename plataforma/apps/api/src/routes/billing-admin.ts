import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { INTERCITY_MODELS, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES } from "@uni/shared";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import { payments, plans, refunds, subscriptions, universities, users } from "../db/schema.ts";
import { badRequest, notFound, parse } from "../errors.ts";
import { ilikeAny, localDate, notify, PageQuery, uuidParam } from "../lib.ts";
import { confirmPayment, ensureActivePass, expireSubscriptions } from "../services/billing.ts";

const PlanFields = z.object({
  name: z.string().trim().min(3, "Indique o nome do plano.").max(80),
  description: z.string().trim().max(500).nullable().optional(),
  priceKz: z.coerce.number().int().min(0, "O preço não pode ser negativo.").max(10_000_000),
  periodDays: z.coerce.number().int().min(1).max(366),
  requiresBooking: z.boolean(),
  maxBookingsPerDay: z.coerce.number().int().min(1).max(10),
  intercityModel: z.enum(INTERCITY_MODELS),
  intercityDiscountPct: z.coerce.number().int().min(0).max(100),
  intercityCredits: z.coerce.number().int().min(0).max(100),
  active: z.boolean(),
});

/** Um plano mensal nunca concede viagens intercidades ilimitadas: o modelo tem de ter um limite explícito. */
function checkIntercity(p: { intercityModel?: string; intercityDiscountPct?: number; intercityCredits?: number }) {
  if ((p.intercityModel === "included" || p.intercityModel === "credits") && !p.intercityCredits) {
    throw badRequest("Defina o número de viagens intercidades incluídas.", { fields: { intercityCredits: "Obrigatório e superior a zero." } });
  }
  if (p.intercityModel === "discount" && !p.intercityDiscountPct) {
    throw badRequest("Defina a percentagem de desconto.", { fields: { intercityDiscountPct: "Obrigatório e superior a zero." } });
  }
}

const Review = z.object({ note: z.string().trim().max(500).optional() });

export async function billingAdminRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  // ------------------------------------------------------------ Planos
  app.get("/admin/plans", { preHandler: can("plans.read") }, async () => db.select().from(plans).orderBy(asc(plans.priceKz)));

  app.post("/admin/plans", { preHandler: can("plans.write") }, async (request, reply) => {
    const body = parse(PlanFields, request.body);
    checkIntercity(body);
    const [plan] = await db.insert(plans).values(body).returning();
    await audit(db, request, { action: "plan.create", entityType: "plan", entityId: plan!.id, details: { priceKz: body.priceKz } });
    return reply.status(201).send(plan);
  });

  app.patch("/admin/plans/:id", { preHandler: can("plans.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(PlanFields.partial(), request.body);
    const [current] = await db.select().from(plans).where(eq(plans.id, id));
    if (!current) throw notFound("Plano não encontrado.");
    checkIntercity({ ...current, ...body });
    // O preço das subscrições existentes fica fixado; a alteração aplica-se apenas a novas adesões.
    const [plan] = await db.update(plans).set({ ...body, updatedAt: app.ctx.now() }).where(eq(plans.id, id)).returning();
    await audit(db, request, { action: "plan.update", entityType: "plan", entityId: id, details: body });
    return plan;
  });

  // ------------------------------------------------------------ Subscrições
  app.get("/admin/subscriptions", { preHandler: can("subscriptions.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(SUBSCRIPTION_STATUSES).optional() }), request.query);
    const where = and(q.status ? eq(subscriptions.status, q.status) : undefined, ilikeAny(q.search, sql`${users.fullName}`, sql`${users.email}`));
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          priceKz: subscriptions.priceKz,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          statusReason: subscriptions.statusReason,
          createdAt: subscriptions.createdAt,
          studentId: users.id,
          studentName: users.fullName,
          planName: plans.name,
          universityShortName: universities.shortName,
        })
        .from(subscriptions)
        .innerJoin(users, eq(users.id, subscriptions.studentId))
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .innerJoin(universities, eq(universities.id, subscriptions.universityId))
        .where(where)
        .orderBy(desc(subscriptions.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(subscriptions).innerJoin(users, eq(users.id, subscriptions.studentId)).where(where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.patch("/admin/subscriptions/:id", { preHandler: can("subscriptions.write") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ status: z.enum(["suspended", "active"]), reason: z.string().trim().min(3, "Indique o motivo.").max(300) }), request.body);
    return db.transaction(async (tx) => {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).for("update");
      if (!sub) throw notFound("Subscrição não encontrada.");
      if (body.status === "suspended" && sub.status !== "active") throw badRequest("Só é possível suspender subscrições activas.");
      if (body.status === "active") {
        if (sub.status !== "suspended") throw badRequest("Só é possível reactivar subscrições suspensas.");
        if (sub.endDate && sub.endDate < localDate(app.ctx.now())) throw badRequest("O período desta subscrição já terminou.");
      }
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: body.status, statusReason: body.reason, updatedAt: app.ctx.now() })
        .where(eq(subscriptions.id, id))
        .returning();
      if (body.status === "active") await ensureActivePass(tx, sub.studentId);
      await notify(tx, {
        userId: sub.studentId,
        title: body.status === "suspended" ? "Subscrição suspensa" : "Subscrição reactivada",
        body: body.reason,
        kind: "subscription",
      });
      await audit(tx, request, { action: `subscription.${body.status === "active" ? "reactivate" : "suspend"}`, entityType: "subscription", entityId: id, details: { reason: body.reason } });
      return updated;
    });
  });

  app.post("/admin/jobs/expire-subscriptions", { preHandler: can("subscriptions.write") }, async (request) => {
    const expired = await expireSubscriptions(db, app.ctx.now());
    await audit(db, request, { action: "job.expire_subscriptions", entityType: "subscription", details: { expired } });
    return { expired };
  });

  // ------------------------------------------------------------ Pagamentos
  app.get("/admin/payments", { preHandler: can("payments.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(PAYMENT_STATUSES).optional() }), request.query);
    const where = and(
      q.status ? eq(payments.status, q.status) : undefined,
      ilikeAny(q.search, sql`${users.fullName}`, sql`coalesce(${payments.providerReference}, '')`),
    );
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select({
          id: payments.id,
          amountKz: payments.amountKz,
          method: payments.method,
          status: payments.status,
          providerReference: payments.providerReference,
          receiptNote: payments.receiptNote,
          reviewNote: payments.reviewNote,
          confirmedAt: payments.confirmedAt,
          createdAt: payments.createdAt,
          subscriptionId: payments.subscriptionId,
          studentName: users.fullName,
        })
        .from(payments)
        .innerJoin(users, eq(users.id, payments.studentId))
        .where(where)
        .orderBy(desc(payments.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.select({ total: sql<number>`count(*)::int` }).from(payments).innerJoin(users, eq(users.id, payments.studentId)).where(where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/payments/:id/confirm", { preHandler: can("payments.confirm") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(Review, request.body ?? {});
    return db.transaction(async (tx) => {
      const [payment] = await tx.select({ method: payments.method }).from(payments).where(eq(payments.id, id));
      if (!payment) throw notFound("Pagamento não encontrado.");
      if (payment.method !== "bank_transfer") throw badRequest("Só os pagamentos por transferência são confirmados manualmente.");
      const outcome = await confirmPayment(tx, { paymentId: id, reviewerId: request.auth!.userId, note: body.note, now: app.ctx.now() });
      if (outcome === "confirmed") await audit(tx, request, { action: "payment.confirm", entityType: "payment", entityId: id });
      return { id, status: "confirmed", outcome };
    });
  });

  app.post("/admin/payments/:id/reject", { preHandler: can("payments.confirm") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ note: z.string().trim().min(3, "Indique o motivo.").max(500) }), request.body);
    return db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
      if (!payment) throw notFound("Pagamento não encontrado.");
      if (payment.status !== "awaiting_review" && payment.status !== "pending") throw badRequest("Este pagamento já foi decidido.");
      await tx
        .update(payments)
        .set({ status: "failed", reviewedBy: request.auth!.userId, reviewNote: body.note, updatedAt: app.ctx.now() })
        .where(eq(payments.id, id));
      await notify(tx, { userId: payment.studentId, title: "Pagamento não confirmado", body: body.note, kind: "payment_rejected", dedupeKey: `payment_rejected:${id}` });
      await audit(tx, request, { action: "payment.reject", entityType: "payment", entityId: id, details: { note: body.note } });
      return { id, status: "failed" };
    });
  });

  // ------------------------------------------------------------ Reembolsos
  app.get("/admin/refunds", { preHandler: can("refunds.manage") }, async () =>
    db
      .select({
        id: refunds.id,
        paymentId: refunds.paymentId,
        amountKz: refunds.amountKz,
        reason: refunds.reason,
        status: refunds.status,
        decisionNote: refunds.decisionNote,
        createdAt: refunds.createdAt,
        decidedAt: refunds.decidedAt,
        studentName: users.fullName,
      })
      .from(refunds)
      .innerJoin(payments, eq(payments.id, refunds.paymentId))
      .innerJoin(users, eq(users.id, payments.studentId))
      .orderBy(desc(refunds.createdAt))
      .limit(100),
  );

  app.post("/admin/payments/:id/refunds", { preHandler: can("refunds.manage") }, async (request, reply) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ amountKz: z.coerce.number().int().min(1), reason: z.string().trim().min(3).max(500) }), request.body);
    const refund = await db.transaction(async (tx) => {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, id)).for("update");
      if (!payment) throw notFound("Pagamento não encontrado.");
      if (payment.status !== "confirmed") throw badRequest("Só é possível reembolsar pagamentos confirmados.");
      const [{ committed } = { committed: 0 }] = await tx
        .select({ committed: sql<number>`coalesce(sum(${refunds.amountKz}), 0)::int` })
        .from(refunds)
        .where(and(eq(refunds.paymentId, id), sql`${refunds.status} <> 'rejected'`));
      if (committed + body.amountKz > payment.amountKz) throw badRequest("O valor excede o montante ainda reembolsável.");
      const [created] = await tx
        .insert(refunds)
        .values({ paymentId: id, amountKz: body.amountKz, reason: body.reason, requestedBy: request.auth!.userId })
        .returning();
      await audit(tx, request, { action: "refund.request", entityType: "refund", entityId: created!.id, details: { paymentId: id, amountKz: body.amountKz } });
      return created!;
    });
    return reply.status(201).send(refund);
  });

  app.patch("/admin/refunds/:id", { preHandler: can("refunds.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ status: z.enum(["approved", "rejected", "paid"]), note: z.string().trim().max(500).optional() }), request.body);
    return db.transaction(async (tx) => {
      const [refund] = await tx.select().from(refunds).where(eq(refunds.id, id)).for("update");
      if (!refund) throw notFound("Reembolso não encontrado.");
      const allowed = { requested: ["approved", "rejected"], approved: ["paid"], rejected: [], paid: [] } as const;
      if (!(allowed[refund.status] as readonly string[]).includes(body.status)) throw badRequest("Transição de estado inválida.");
      const [updated] = await tx
        .update(refunds)
        .set({ status: body.status, decidedBy: request.auth!.userId, decisionNote: body.note ?? null, decidedAt: app.ctx.now() })
        .where(eq(refunds.id, id))
        .returning();
      if (body.status === "paid") {
        const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).for("update");
        const [{ paid } = { paid: 0 }] = await tx
          .select({ paid: sql<number>`coalesce(sum(${refunds.amountKz}), 0)::int` })
          .from(refunds)
          .where(and(eq(refunds.paymentId, refund.paymentId), eq(refunds.status, "paid")));
        if (payment && paid >= payment.amountKz) {
          await tx.update(payments).set({ status: "refunded", updatedAt: app.ctx.now() }).where(eq(payments.id, payment.id));
          await tx
            .update(subscriptions)
            .set({ status: "cancelled", statusReason: "Pagamento reembolsado.", updatedAt: app.ctx.now() })
            .where(and(eq(subscriptions.id, payment.subscriptionId), sql`${subscriptions.status} in ('active', 'suspended')`));
        }
      }
      await audit(tx, request, { action: `refund.${body.status}`, entityType: "refund", entityId: id });
      return updated;
    });
  });
}
