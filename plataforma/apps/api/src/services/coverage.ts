import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.ts";
import { bookings, routes, routeUniversities, subscriptions, trips } from "../db/schema.ts";
import type { currentSubscription } from "./billing.ts";

type Current = NonNullable<Awaited<ReturnType<typeof currentSubscription>>>;
type RouteRef = { id: string; serviceType: (typeof routes.$inferSelect)["serviceType"] };

export type Coverage = { covered: true; bookingRequired: boolean } | { covered: false; reason: string };

/**
 * Decide se a subscrição abrange a rota. É a única definição de cobertura: usada na reserva e na validação do passe.
 * Rotas universitárias exigem que a rota sirva a universidade confirmada da subscrição. Rotas intercidades só são
 * abrangidas por planos com viagens incluídas ou créditos, sempre com reserva (cada reserva consome uma viagem).
 */
export async function routeCoverage(db: DbOrTx, current: Current, route: RouteRef): Promise<Coverage> {
  if (route.serviceType === "intercity") {
    switch (current.plan.intercityModel) {
      case "included":
      case "credits":
        return { covered: true, bookingRequired: true };
      case "discount":
      case "paid_separately":
        return { covered: false, reason: "A compra de bilhetes intercidades avulsos ainda não está disponível." };
      case "none":
        return { covered: false, reason: "O seu plano não inclui viagens intercidades." };
    }
  }
  const served = await db
    .select({ id: routeUniversities.universityId })
    .from(routeUniversities)
    .where(eq(routeUniversities.routeId, route.id));
  if (!served.some((u) => u.id === current.sub.universityId)) return { covered: false, reason: "A sua subscrição não abrange esta rota." };
  if (current.sub.routeId && current.sub.routeId !== route.id) return { covered: false, reason: "A sua subscrição é válida apenas para outra rota." };
  return { covered: true, bookingRequired: current.plan.requiresBooking };
}

/**
 * Viagens intercidades ainda disponíveis no período da subscrição. Bloqueia a subscrição para que reservas
 * concorrentes do mesmo estudante não ultrapassem o limite.
 */
export async function lockIntercityAllowance(tx: DbOrTx, current: Current, studentId: string): Promise<{ limit: number; used: number }> {
  await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.id, current.sub.id)).for("update");
  const limit = current.plan.intercityCredits;
  const { startDate, endDate } = current.sub;
  if (!startDate || !endDate) return { limit, used: limit };
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .innerJoin(trips, eq(trips.id, bookings.tripId))
    .innerJoin(routes, eq(routes.id, trips.routeId))
    .where(
      and(
        eq(bookings.studentId, studentId),
        eq(routes.serviceType, "intercity"),
        inArray(bookings.status, ["confirmed", "boarded", "no_show"]),
        gte(trips.serviceDate, startDate),
        lte(trips.serviceDate, endDate),
      ),
    );
  return { limit, used: row?.n ?? 0 };
}
