import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, type Permission, type Role } from "@uni/shared";
import { audit } from "../audit.ts";
import { sessions, users } from "../db/schema.ts";
import { forbidden, unauthorized } from "../errors.ts";
import { verifyAccessToken } from "./tokens.ts";

/**
 * Autentica o pedido. Além da assinatura do JWT, confirma em cada pedido que a sessão não foi
 * revogada e que a conta continua activa, para que a revogação tenha efeito imediato.
 */
export async function requireAuth(request: FastifyRequest, _reply?: FastifyReply): Promise<void> {
  if (request.auth) return;
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized("Autenticação necessária.");
  const { db, env, now } = request.server.ctx;
  const claims = await verifyAccessToken(env.JWT_SECRET, header.slice(7));
  if (!claims) throw unauthorized();
  const [row] = await db
    .select({ userId: users.id, role: users.role, fullName: users.fullName, status: users.status })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, claims.sessionId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now())))
    .limit(1);
  if (!row || row.userId !== claims.userId || row.status !== "active") throw unauthorized();
  request.auth = { userId: row.userId, sessionId: claims.sessionId, role: row.role, fullName: row.fullName };
}

/** Exige autenticação e todas as permissões indicadas. As recusas ficam registadas na auditoria. */
export function can(...permissions: Permission[]) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    const role = request.auth!.role;
    const missing = permissions.filter((p) => !hasPermission(role, p));
    if (missing.length > 0) {
      await audit(request.server.ctx.db, request, {
        action: "access.denied",
        entityType: "endpoint",
        entityId: `${request.method} ${request.routeOptions.url ?? request.url}`,
        result: "denied",
        details: { missing },
      });
      throw forbidden();
    }
  };
}

export function roleIs(...roles: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    if (!roles.includes(request.auth!.role)) {
      await audit(request.server.ctx.db, request, {
        action: "access.denied",
        entityType: "endpoint",
        entityId: `${request.method} ${request.routeOptions.url ?? request.url}`,
        result: "denied",
        details: { requiredRoles: roles },
      });
      throw forbidden();
    }
  };
}
