import { and, eq, inArray, lt } from "drizzle-orm";
import type { DbOrTx, Tx } from "../db/client.ts";
import { passes, payments, plans, subscriptions } from "../db/schema.ts";
import { opaqueCode } from "../auth/crypto.ts";
import { badRequest, notFound } from "../errors.ts";
import { addDays, localDate, notify } from "../lib.ts";

export type ConfirmOutcome = "confirmed" | "already_confirmed";

/**
 * Confirma um pagamento e activa a subscrição. É idempotente: confirmar duas vezes o mesmo pagamento
 * (clique repetido, webhook reenviado) não prolonga a subscrição nem emite outro passe.
 */
export async function confirmPayment(
  tx: Tx,
  input: { paymentId: string; reviewerId: string | null; note?: string; now: Date },
): Promise<ConfirmOutcome> {
  const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).for("update");
  if (!payment) throw notFound("Pagamento não encontrado.");
  if (payment.status === "confirmed") return "already_confirmed";
  if (payment.status !== "pending" && payment.status !== "awaiting_review") {
    throw badRequest("Este pagamento já não pode ser confirmado.");
  }

  const [subscription] = await tx
    .select({ sub: subscriptions, periodDays: plans.periodDays })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.id, payment.subscriptionId))
    .for("update");
  if (!subscription) throw notFound("Subscrição não encontrada.");
  if (subscription.sub.status !== "pending_payment") {
    throw badRequest("A subscrição associada já não aguarda pagamento.");
  }

  await tx
    .update(payments)
    .set({ status: "confirmed", confirmedAt: input.now, reviewedBy: input.reviewerId, reviewNote: input.note ?? null, updatedAt: input.now })
    .where(eq(payments.id, payment.id));

  const startDate = localDate(input.now);
  await tx
    .update(subscriptions)
    .set({ status: "active", startDate, endDate: addDays(startDate, subscription.periodDays - 1), statusReason: null, updatedAt: input.now })
    .where(eq(subscriptions.id, payment.subscriptionId));

  await ensureActivePass(tx, payment.studentId);
  await notify(tx, {
    userId: payment.studentId,
    title: "Pagamento confirmado",
    body: "A sua subscrição está activa e o passe digital já pode ser utilizado.",
    kind: "payment_confirmed",
    dedupeKey: `payment_confirmed:${payment.id}`,
  });
  return "confirmed";
}

/** Garante que o estudante tem um passe activo. O passe identifica o titular; a validade vem da subscrição. */
export async function ensureActivePass(db: DbOrTx, studentId: string): Promise<void> {
  const [existing] = await db
    .select({ id: passes.id })
    .from(passes)
    .where(and(eq(passes.studentId, studentId), eq(passes.status, "active")));
  if (existing) return;
  await db.insert(passes).values({ studentId, publicCode: opaqueCode(10) }).onConflictDoNothing();
}

/** Marca como expiradas as subscrições activas cujo período terminou antes da data local actual. */
export async function expireSubscriptions(db: DbOrTx, now: Date): Promise<number> {
  const today = localDate(now);
  const expired = await db
    .update(subscriptions)
    .set({ status: "expired", updatedAt: now })
    .where(and(eq(subscriptions.status, "active"), lt(subscriptions.endDate, today)))
    .returning({ id: subscriptions.id, studentId: subscriptions.studentId });
  for (const s of expired) {
    await notify(db, {
      userId: s.studentId,
      title: "Subscrição expirada",
      body: "O período da sua subscrição terminou. Renove para continuar a viajar.",
      kind: "subscription_expired",
      dedupeKey: `subscription_expired:${s.id}`,
    });
  }
  return expired.length;
}

/** Subscrição actual do estudante (activa ou suspensa), tendo em conta a data local. */
export async function currentSubscription(db: DbOrTx, studentId: string, now: Date) {
  const today = localDate(now);
  const [row] = await db
    .select({ sub: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.studentId, studentId), inArray(subscriptions.status, ["active", "suspended"])));
  if (!row) return null;
  const expired = row.sub.status === "active" && row.sub.endDate !== null && row.sub.endDate < today;
  return { ...row, effectiveStatus: expired ? ("expired" as const) : row.sub.status };
}
