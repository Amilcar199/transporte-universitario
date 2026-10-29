import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { LABELS, type PassValidationResult } from "@uni/shared";
import { audit } from "../audit.ts";
import { can } from "../auth/guard.ts";
import { signPassToken, verifyPassToken } from "../auth/tokens.ts";
import type { DbOrTx } from "../db/client.ts";
import { bookings, partnerCarriers, partnerValidators, passes, passValidations, routes, trips, universities, users, vehicles } from "../db/schema.ts";
import { badRequest, forbidden, notFound, parse } from "../errors.ts";
import { uuidParam } from "../lib.ts";
import { currentSubscription } from "../services/billing.ts";
import { routeCoverage } from "../services/coverage.ts";

const ValidateBody = z.object({
  token: z.string().min(20).max(2000),
  tripId: z.string().uuid(),
});

/** Primeiro nome e inicial do apelido: suficiente para confirmar a identidade sem expor mais dados. */
function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1]!.charAt(0)}.` : "";
  return `${first}${last}`;
}

/**
 * Viagens em que o utilizador pode validar passes: o motorista nas viagens que conduz, o validador de um parceiro
 * nas viagens feitas com veículos da sua transportadora, e a equipa com `passes.validate` em qualquer viagem.
 */
async function validatorTripScope(db: DbOrTx, auth: NonNullable<FastifyRequest["auth"]>): Promise<SQL> {
  if (auth.role === "driver") return eq(trips.driverId, auth.userId);
  if (auth.role === "partner_validator") {
    const carriers = await db
      .select({ id: partnerValidators.carrierId })
      .from(partnerValidators)
      .innerJoin(partnerCarriers, eq(partnerCarriers.id, partnerValidators.carrierId))
      .where(and(eq(partnerValidators.userId, auth.userId), eq(partnerCarriers.active, true)));
    if (carriers.length === 0) return sql`false`;
    return inArray(
      trips.vehicleId,
      db.select({ id: vehicles.id }).from(vehicles).where(inArray(vehicles.carrierId, carriers.map((c) => c.id))),
    );
  }
  return sql`true`;
}

export async function passRoutes(app: FastifyInstance) {
  const { db, env } = app.ctx;

  /** Viagens em curso onde o utilizador pode validar passes (usado pelo modo de validação da app). */
  app.get("/validator/trips", { preHandler: can("passes.validate") }, async (request) =>
    db
      .select({
        id: trips.id,
        serviceDate: trips.serviceDate,
        departureTime: trips.departureTime,
        status: trips.status,
        routeCode: routes.code,
        routeName: routes.name,
        vehiclePlate: vehicles.plate,
      })
      .from(trips)
      .innerJoin(routes, eq(routes.id, trips.routeId))
      .innerJoin(vehicles, eq(vehicles.id, trips.vehicleId))
      .where(and(eq(trips.status, "in_progress"), await validatorTripScope(db, request.auth!)))
      .orderBy(asc(trips.departureTime))
      .limit(100),
  );

  app.get("/passes/me", { preHandler: can("student.self") }, async (request) => {
    const userId = request.auth!.userId;
    const now = app.ctx.now();
    const [[pass], current] = await Promise.all([
      db.select().from(passes).where(and(eq(passes.studentId, userId), eq(passes.status, "active"))),
      currentSubscription(db, userId, now),
    ]);
    if (!pass) return { pass: null, status: "none" as const };
    const [uni] = current
      ? await db.select({ shortName: universities.shortName }).from(universities).where(eq(universities.id, current.sub.universityId))
      : [];
    return {
      pass: { id: pass.id, publicCode: pass.publicCode, issuedAt: pass.issuedAt },
      status: current ? current.effectiveStatus : ("expired" as const),
      subscription: current && {
        planName: current.plan.name,
        endDate: current.sub.endDate,
        universityShortName: uni?.shortName ?? null,
        requiresBooking: current.plan.requiresBooking,
      },
    };
  });

  /** Token curto para o QR. É renovado pela app antes de expirar; cada leitura autorizada consome o jti. */
  app.get("/passes/me/token", { preHandler: can("student.self") }, async (request) => {
    const [pass] = await db
      .select({ id: passes.id })
      .from(passes)
      .where(and(eq(passes.studentId, request.auth!.userId), eq(passes.status, "active")));
    if (!pass) throw notFound("Não tem um passe activo.");
    const now = app.ctx.now();
    const token = await signPassToken(env.PASS_TOKEN_SECRET, { passId: pass.id, jti: randomUUID() }, now, env.PASS_TOKEN_TTL_SECONDS);
    return { token, expiresAt: new Date(now.getTime() + env.PASS_TOKEN_TTL_SECONDS * 1000) };
  });

  app.post("/passes/validate", { preHandler: can("passes.validate") }, async (request) => {
    const body = parse(ValidateBody, request.body);
    const validatorId = request.auth!.userId;
    const now = app.ctx.now();

    const [trip] = await db.select().from(trips).where(and(eq(trips.id, body.tripId), await validatorTripScope(db, request.auth!)));
    if (!trip) throw notFound("Viagem não encontrada ou fora da sua área de validação.");
    if (trip.status !== "in_progress") throw badRequest("Inicie a viagem antes de validar passes.");

    const verified = await verifyPassToken(env.PASS_TOKEN_SECRET, body.token, now);

    const respond = async (
      result: PassValidationResult,
      extra: { passId?: string; jti?: string; holder?: string; seatNumber?: number; reason?: string } = {},
    ) => {
      await db.insert(passValidations).values({ passId: extra.passId ?? null, validatorId, tripId: trip.id, result, tokenJti: extra.jti ?? null });
      return {
        result,
        label: LABELS.passValidation[result],
        holder: extra.holder ?? null,
        seatNumber: extra.seatNumber ?? null,
        reason: extra.reason ?? null,
      };
    };

    if (!verified.ok) {
      return respond("invalid", {
        reason: verified.reason === "token_expired" ? "O código expirou. Peça ao estudante para actualizar o passe." : "Código não reconhecido.",
      });
    }
    const { passId, jti } = verified.claims;
    const [pass] = await db
      .select({ id: passes.id, status: passes.status, studentId: passes.studentId, fullName: users.fullName })
      .from(passes)
      .innerJoin(users, eq(users.id, passes.studentId))
      .where(eq(passes.id, passId));
    if (!pass) return respond("invalid", { reason: "Código não reconhecido." });
    const holder = shortName(pass.fullName);
    if (pass.status === "revoked") return respond("revoked", { passId, holder });

    const current = await currentSubscription(db, pass.studentId, now);
    if (!current || current.effectiveStatus === "expired") return respond("expired", { passId, holder });
    if (current.effectiveStatus === "suspended") return respond("suspended", { passId, holder });

    const [route] = await db.select({ id: routes.id, serviceType: routes.serviceType }).from(routes).where(eq(routes.id, trip.routeId));
    const coverage = await routeCoverage(db, current, route!);
    if (!coverage.covered) return respond("not_covered", { passId, holder });

    const [booking] = await db
      .select({ id: bookings.id, status: bookings.status, seatNumber: bookings.seatNumber })
      .from(bookings)
      .where(and(eq(bookings.tripId, trip.id), eq(bookings.studentId, pass.studentId), inArray(bookings.status, ["confirmed", "boarded"])));
    if (coverage.bookingRequired && !booking) return respond("booking_required", { passId, holder });

    return db.transaction(async (tx) => {
      // O índice único sobre o jti das validações autorizadas impede reutilizar o mesmo QR.
      const inserted = await tx
        .insert(passValidations)
        .values({ passId, validatorId, tripId: trip.id, result: "authorized", tokenJti: jti })
        .onConflictDoNothing()
        .returning({ id: passValidations.id });
      if (inserted.length === 0) {
        await tx.insert(passValidations).values({ passId, validatorId, tripId: trip.id, result: "invalid", tokenJti: jti });
        return { result: "invalid" as const, label: LABELS.passValidation.invalid, holder, seatNumber: null, reason: "Este código já foi utilizado." };
      }
      if (booking?.status === "confirmed") {
        await tx.update(bookings).set({ status: "boarded", boardedAt: now }).where(eq(bookings.id, booking.id));
      }
      return { result: "authorized" as const, label: LABELS.passValidation.authorized, holder, seatNumber: booking?.seatNumber ?? null, reason: null };
    });
  });

  app.get("/admin/passes/validations", { preHandler: can("passes.read") }, async () =>
    db
      .select({
        id: passValidations.id,
        result: passValidations.result,
        createdAt: passValidations.createdAt,
        tripId: passValidations.tripId,
        validatorName: users.fullName,
      })
      .from(passValidations)
      .innerJoin(users, eq(users.id, passValidations.validatorId))
      .orderBy(desc(passValidations.createdAt))
      .limit(100),
  );

  app.post("/admin/passes/:id/revoke", { preHandler: can("passes.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ reason: z.string().trim().min(3, "Indique o motivo.").max(300) }), request.body);
    const [updated] = await db
      .update(passes)
      .set({ status: "revoked", revokedAt: app.ctx.now(), revokeReason: body.reason })
      .where(and(eq(passes.id, id), eq(passes.status, "active")))
      .returning({ id: passes.id, status: passes.status });
    if (!updated) throw notFound("Passe activo não encontrado.");
    await audit(db, request, { action: "pass.revoke", entityType: "pass", entityId: id, details: { reason: body.reason } });
    return updated;
  });
}
