import { z } from "zod";

const boolFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((v) => v === "true");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  /**
   * `postgres://…` usa PostgreSQL. `pglite:./data/dev` usa PostgreSQL embutido (WASM) guardado em disco,
   * e `pglite:memory` em memória (testes). PGlite destina-se a desenvolvimento e testes.
   */
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET deve ter pelo menos 32 caracteres"),
  PASS_TOKEN_SECRET: z.string().min(32, "PASS_TOKEN_SECRET deve ter pelo menos 32 caracteres"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  PASS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  /** Pedidos por minuto e por IP nos endpoints de autenticação (início de sessão, registo, recuperação). */
  AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  /** Activa o fornecedor de pagamentos de testes. Nunca activar em produção. */
  PAYMENTS_SANDBOX_ENABLED: boolFromString,
  /** Dados bancários mostrados para pagamento por transferência (confirmado manualmente pelo financeiro). */
  BANK_TRANSFER_IBAN: z.string().default(""),
  BANK_TRANSFER_BENEFICIARY: z.string().default(""),
  /** Em desenvolvimento, devolve o código de recuperação na resposta em vez de o enviar. */
  DEV_EXPOSE_RESET_CODES: boolFromString,
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida. Verifique o ficheiro .env (ver .env.example):\n${problems}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    if (env.PAYMENTS_SANDBOX_ENABLED) throw new Error("PAYMENTS_SANDBOX_ENABLED não pode estar activo em produção.");
    if (env.DEV_EXPOSE_RESET_CODES) throw new Error("DEV_EXPOSE_RESET_CODES não pode estar activo em produção.");
    if (env.DATABASE_URL.startsWith("pglite:")) throw new Error("Em produção, DATABASE_URL deve apontar para PostgreSQL.");
  }
  return env;
}
