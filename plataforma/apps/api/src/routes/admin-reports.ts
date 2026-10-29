import { and, asc, eq, gte, lt, lte, ne, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hasPermission } from "@uni/shared";
import { can } from "../auth/guard.ts";
import { bookings, incidents, passValidations, payments, routes, subscriptions, trips } from "../db/schema.ts";
import { badRequest, parse } from "../errors.ts";
import { addDays, dateSchema, localDate, qualified } from "../lib.ts";

const MAX_RANGE_DAYS = 366;

/** Converte uma data local (Africa/Luanda, UTC+1) no instante UTC em que esse dia começa. */
function luandaDayStart(date: string): Date {
  return new Date(`${date}T00:00:00+01:00`);
}

export async function adminReportRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  app.get("/admin/reports", { preHandler: can("reports.view") }, async (request) => {
    const today = localDate(app.ctx.now());
    const q = parse(z.object({ from: dateSchema.optional(), to: dateSchema.optional() }), request.query);
    const to = q.to ?? today;
    const from = q.from ?? addDays(to, -29);
    if (from > to) throw badRequest("A data inicial tem de ser anterior à final.");
    if (addDays(from, MAX_RANGE_DAYS) < to) throw badRequest(`O período máximo é de ${MAX_RANGE_DAYS} dias.`);
    const start = luandaDayStart(from);
    const end = luandaDayStart(addDays(to, 1));

    const count = (status: string) => sql<number>`count(${bookings.id}) filter (where ${bookings.status} = ${status})::int`;
    const occupancy = await db
      .select({
        routeId: routes.id,
        routeCode: routes.code,
        serviceType: routes.serviceType,
        trips: sql<number>`count(distinct ${trips.id})::int`,
        seats: sql<number>`(select coalesce(sum(t2.capacity), 0)::int from ${trips} t2 where t2.route_id = ${qualified(routes.id)} and t2.service_date between ${from} and ${to} and t2.status <> 'cancelled')`,
        confirmed: count("confirmed"),
        boarded: count("boarded"),
        noShow: count("no_show"),
        cancelled: count("cancelled"),
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .leftJoin(bookings, eq(bookings.tripId, trips.id))
      .where(and(gte(trips.serviceDate, from), lte(trips.serviceDate, to), ne(trips.status, "cancelled")))
      .groupBy(routes.id, routes.code, routes.serviceType)
      .orderBy(asc(routes.code));

    const [validations, incidentRows, subscriptionRows] = await Promise.all([
      db
        .select({ result: passValidations.result, n: sql<number>`count(*)::int` })
        .from(passValidations)
        .where(and(gte(passValidations.createdAt, start), lt(passValidations.createdAt, end)))
        .groupBy(passValidations.result),
      db
        .select({ kind: incidents.kind, n: sql<number>`count(*)::int` })
        .from(incidents)
        .where(and(gte(incidents.createdAt, start), lt(incidents.createdAt, end)))
        .groupBy(incidents.kind),
      db.select({ status: subscriptions.status, n: sql<number>`count(*)::int` }).from(subscriptions).groupBy(subscriptions.status),
    ]);

    // Totais financeiros só para perfis com acesso a pagamentos.
    const paymentRows = hasPermission(request.auth!.role, "payments.read")
      ? await db
          .select({ method: payments.method, status: payments.status, n: sql<number>`count(*)::int`, totalKz: sql<number>`coalesce(sum(${payments.amountKz}), 0)::int` })
          .from(payments)
          .where(and(gte(payments.createdAt, start), lt(payments.createdAt, end)))
          .groupBy(payments.method, payments.status)
      : null;

    return {
      period: { from, to },
      occupancy: occupancy.map((r) => {
        const used = r.confirmed + r.boarded + r.noShow;
        return { ...r, occupancyPct: r.seats > 0 ? Math.round((used / r.seats) * 1000) / 10 : null };
      }),
      validations,
      incidents: incidentRows,
      subscriptionsByStatus: subscriptionRows,
      payments: paymentRows,
      notes: [
        "A ocupação conta reservas confirmadas, embarcadas e faltas sobre os lugares das viagens não canceladas.",
        "Os valores de pagamentos incluem todos os estados; apenas os confirmados correspondem a receita.",
      ],
    };
  });
}
