import type { FastifyRequest } from "fastify";
import type { DbOrTx } from "./db/client.ts";
import { auditLogs } from "./db/schema.ts";

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  result?: "success" | "denied" | "failure";
  /** Nunca incluir palavras-passe, tokens ou outros segredos. */
  details?: Record<string, unknown>;
}

export async function audit(db: DbOrTx, request: FastifyRequest, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorId: request.auth?.userId ?? null,
    actorRole: request.auth?.role ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    result: entry.result ?? "success",
    details: entry.details ?? null,
    ip: request.ip,
  });
}
