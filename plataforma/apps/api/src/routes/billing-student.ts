import { and, asc, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PAYMENT_METHODS } from "@uni/shared";
import { audit } from "../audit.ts";
import { can, requireAuth } from "../auth/guard.ts";
import { paymentEvents, payments, plans, routeUniversities, studentProfiles, subscriptions } from "../db/schema.ts";
import { badRequest, conflict, forbidden, notFound, parse } from "../errors.ts";
import { uuidParam } from "../lib.ts";
import { confirmPayment } from "../services/billing.ts";

const SubscriptionCreate = z.object({
  planId: z.string().uuid(),
  routeId: z.string().uuid().nullable().optional(),
});

const PaymentCreate = z.object({
  subscriptionId: z.string().uuid(),
  method: z.enum(PAYMENT_METHODS),
  /** Gerada pelo cliente por cada intenção de pagamento; repetir o pedido devolve o mesmo pagamento. */
  idempotencyKey: z.string().trim().min(8).max(100),
});

const ReceiptSubmit = z.object({
  reference: z.string().trim().min(4, "Indique a referência da transferência.").max(60),
  note: z.string().trim().max(300).optional(),
});

const paymentColumns = {
  id: payments.id,
  subscriptionId: payments.subscriptionId,
  amountKz: payments.amountKz,
  method: payments.method,
  status: payments.status,
  providerReference: payments.providerReference,
  reviewNote: payments.reviewNote,
  confirmedAt: payments.confirmedAt,
  createdAt: payments.createdAt,
};

export async function billingStudentRoutes(app: FastifyInstance) {
  const { db } = app.ctx;
  const student = { preHandler: can("student.self") };

  app.get("/plans", async () =>
    db
      .select({
        id: plans.id,
        name: plans.name,
        description: plans.description,
        priceKz: plans.priceKz,
        periodDays: plans.periodDays,
        requiresBooking: plans.requiresBooking,
        maxBookingsPerDay: plans.maxBookingsPerDay,
        intercityModel: plans.intercityModel,
        intercityDiscountPct: plans.intercityDiscountPct,
        intercityCredits: plans.intercityCredits,
        isDemo: plans.isDemo,
      })
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(asc(plans.priceKz)),
  );

  app.get("/payment-methods", { preHandler: requireAuth }, async () => app.ctx.payments.list());

  app.get("/subscriptions/me", student, async (request) => {
    const userId = request.auth!.userId;
    const [subs, pays] = await Promise.all([
      db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          priceKz: subscriptions.priceKz,
          startDate: subscriptions.startDate,
          endDate: subscriptions.endDate,
          statusReason: subscriptions.statusReason,
          routeId: subscriptions.routeId,
          createdAt: subscriptions.createdAt,
          planName: plans.name,
          maxBookingsPerDay: plans.maxBookingsPerDay,
          intercityModel: plans.intercityModel,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.studentId, userId))
        .orderBy(desc(subscriptions.createdAt))
        .limit(12),
      db.select(paymentColumns).from(payments).where(eq(payments.studentId, userId)).orderBy(desc(payments.createdAt)).limit(30),
    ]);
    return subs.map((s) => ({ ...s, payments: pays.filter((p) => p.subscriptionId === s.id) }));
  });

  app.post("/subscriptions", student, async (request, reply) => {
    const body = parse(SubscriptionCreate, request.body);
    const userId = request.auth!.userId;
    const created = await db.transaction(async (tx) => {
      const [profile] = await tx.select().from(studentProfiles).where(eq(studentProfiles.userId, userId));
      // Os benefícios universitários dependem de verificação aprovada, não do nome indicado no registo.
      if (profile?.verificationStatus !== "approved" || !profile.universityId) {
        throw forbidden("Confirme primeiro a sua inscrição universitária.");
      }
      const [plan] = await tx.select().from(plans).where(eq(plans.id, body.planId));
      if (!plan?.active) throw badRequest("Plano indisponível.");
      if (body.routeId) {
        const [served] = await tx
          .select()
          .from(routeUniversities)
          .where(and(eq(routeUniversities.routeId, body.routeId), eq(routeUniversities.universityId, profile.universityId)));
        if (!served) throw badRequest("Esta rota não serve a sua universidade.");
      }
      const [sub] = await tx
        .insert(subscriptions)
        .values({ studentId: userId, planId: plan.id, universityId: profile.universityId, routeId: body.routeId ?? null, priceKz: plan.priceKz })
        .returning();
      await audit(tx, request, { action: "subscription.create", entityType: "subscription", entityId: sub!.id, details: { planId: plan.id } });
      return sub!;
    });
    return reply.status(201).send(created);
  });

  app.post("/subscriptions/:id/cancel", student, async (request) => {
    const { id } = parse(uuidParam, request.params);
    return db.transaction(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.id, id), eq(subscriptions.studentId, request.auth!.userId)))
        .for("update");
      if (!sub) throw notFound("Subscrição não encontrada.");
      if (sub.status !== "pending_payment") throw badRequest("Só é possível cancelar subscrições que aguardam pagamento.");
      const [awaiting] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.subscriptionId, id), eq(payments.status, "awaiting_review")));
      if (awaiting) throw badRequest("Existe um comprovativo em análise para esta subscrição.");
      await tx.update(payments).set({ status: "cancelled", updatedAt: app.ctx.now() }).where(and(eq(payments.subscriptionId, id), eq(payments.status, "pending")));
      const [updated] = await tx
        .update(subscriptions)
        .set({ status: "cancelled", statusReason: "Cancelada pelo estudante.", updatedAt: app.ctx.now() })
        .where(eq(subscriptions.id, id))
        .returning({ id: subscriptions.id, status: subscriptions.status });
      await audit(tx, request, { action: "subscription.cancel", entityType: "subscription", entityId: id });
      return updated;
    });
  });

  app.post("/payments", student, async (request, reply) => {
    const body = parse(PaymentCreate, request.body);
    const userId = request.auth!.userId;
    const info = app.ctx.payments.get(body.method);

    const [existing] = await db
      .select(paymentColumns)
      .from(payments)
      .where(and(eq(payments.studentId, userId), eq(payments.idempotencyKey, body.idempotencyKey)));
    if (existing) {
      if (existing.subscriptionId !== body.subscriptionId || existing.method !== body.method) {
        throw conflict("Esta chave de idempotência já foi usada noutro pagamento.", "idempotency_mismatch");
      }
      return reply.status(200).send({ ...existing, instructions: info.instructions ?? null });
    }
    if (!info.available) throw badRequest(info.unavailableReason ?? "Método de pagamento indisponível.");

    const created = await db.transaction(async (tx) => {
      const [sub] = await tx
        .select()
        .from(subscriptions)
        .where(and(eq(subscriptions.id, body.subscriptionId), eq(subscriptions.studentId, userId)))
        .for("update");
      if (!sub) throw notFound("Subscrição não encontrada.");
      if (sub.status !== "pending_payment") throw badRequest("Esta subscrição não aguarda pagamento.");
      const [open] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.subscriptionId, sub.id), eq(payments.status, "awaiting_review")));
      if (open) throw conflict("Já existe um comprovativo em análise para esta subscrição.", "payment_in_review");
      const [payment] = await tx
        .insert(payments)
        .values({ subscriptionId: sub.id, studentId: userId, amountKz: sub.priceKz, method: body.method, idempotencyKey: body.idempotencyKey })
        .returning(paymentColumns);
      await audit(tx, request, { action: "payment.create", entityType: "payment", entityId: payment!.id, details: { method: body.method } });
      return payment!;
    });
    return reply.status(201).send({ ...created, instructions: info.instructions ?? null });
  });

  app.get("/payments/me", student, async (request) =>
    db.select(paymentColumns).from(payments).where(eq(payments.studentId, request.auth!.userId)).orderBy(desc(payments.createdAt)).limit(30),
  );

  app.post("/payments/:id/receipt", student, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(ReceiptSubmit, request.body);
    return db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, id), eq(payments.studentId, request.auth!.userId)))
        .for("update");
      if (!payment) throw notFound("Pagamento não encontrado.");
      if (payment.method !== "bank_transfer") throw badRequest("Este método não usa comprovativo.");
      if (payment.status !== "pending") throw badRequest("O comprovativo deste pagamento já foi enviado.");
      const [updated] = await tx
        .update(payments)
        .set({ status: "awaiting_review", providerReference: body.reference, receiptNote: body.note ?? null, updatedAt: app.ctx.now() })
        .where(eq(payments.id, id))
        .returning(paymentColumns);
      await audit(tx, request, { action: "payment.receipt", entityType: "payment", entityId: id });
      return updated;
    });
  });

  /**
   * Apenas no ambiente de testes: simula o evento que um fornecedor enviaria. Passa pelo mesmo registo
   * idempotente de eventos e pela mesma confirmação do servidor. Indisponível em produção.
   */
  app.post("/payments/:id/sandbox/complete", student, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ outcome: z.enum(["success", "failure"]) }), request.body);
    if (!app.ctx.payments.get("sandbox").available) throw forbidden("O ambiente de testes de pagamentos está desactivado.");
    return db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.id, id), eq(payments.studentId, request.auth!.userId)));
      if (!payment) throw notFound("Pagamento não encontrado.");
      if (payment.method !== "sandbox") throw badRequest("Este pagamento não pertence ao ambiente de testes.");
      const inserted = await tx
        .insert(paymentEvents)
        .values({ method: "sandbox", externalEventId: `sandbox:${id}`, paymentId: id, payload: { outcome: body.outcome, simulated: true } })
        .onConflictDoNothing()
        .returning({ id: paymentEvents.id });
      if (inserted.length === 0) {
        const [current] = await tx.select(paymentColumns).from(payments).where(eq(payments.id, id));
        return { ...current, duplicateEvent: true };
      }
      if (body.outcome === "success") {
        await confirmPayment(tx, { paymentId: id, reviewerId: null, note: "Confirmado pelo ambiente de testes.", now: app.ctx.now() });
      } else {
        await tx.update(payments).set({ status: "failed", reviewNote: "Falha simulada no ambiente de testes.", updatedAt: app.ctx.now() }).where(eq(payments.id, id));
      }
      await audit(tx, request, { action: `payment.sandbox_${body.outcome}`, entityType: "payment", entityId: id });
      const [current] = await tx.select(paymentColumns).from(payments).where(eq(payments.id, id));
      return { ...current, duplicateEvent: false };
    });
  });
}
