import type { Role } from "@uni/shared";
import type { Db } from "./db/client.ts";
import type { Env } from "./env.ts";
import type { PaymentProviders } from "./payments/providers.ts";

export interface AppContext {
  db: Db;
  env: Env;
  payments: PaymentProviders;
  /** Relógio injectável para testes de expiração. */
  now: () => Date;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  role: Role;
  fullName: string;
}

declare module "fastify" {
  interface FastifyInstance {
    ctx: AppContext;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
