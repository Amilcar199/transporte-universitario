import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ROLE_PERMISSIONS } from "@uni/shared";
import { audit } from "../audit.ts";
import { hashPassword, randomNumericCode, randomToken, sha256, verifyPassword } from "../auth/crypto.ts";
import { requireAuth } from "../auth/guard.ts";
import { signAccessToken } from "../auth/tokens.ts";
import type { DbOrTx } from "../db/client.ts";
import { passwordResets, sessions, studentProfiles, universities, users } from "../db/schema.ts";
import { AppError, badRequest, notFound, parse, unauthorized } from "../errors.ts";

export const passwordSchema = z
  .string()
  .min(8, "A palavra-passe deve ter pelo menos 8 caracteres.")
  .max(128, "A palavra-passe é demasiado longa.");
export const emailSchema = z.string().trim().toLowerCase().email("Email inválido.");
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{9,16}$/, "Número de telefone inválido.")
  .transform((v) => v.replace(/\s+/g, ""));

const RegisterSchema = z.object({
  fullName: z.string().trim().min(3, "Indique o nome completo.").max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
  universityId: z.string().uuid().optional(),
  studentNumber: z.string().trim().max(40).optional(),
  deviceLabel: z.string().trim().max(80).optional(),
});

const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Indique a palavra-passe."),
  deviceLabel: z.string().trim().max(80).optional(),
});

/** Hash usado quando o email não existe, para que o tempo de resposta não revele contas. */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export async function issueSession(
  db: DbOrTx,
  request: FastifyRequest,
  user: { id: string; role: (typeof users.$inferSelect)["role"] },
  deviceLabel?: string,
) {
  const { env, now } = request.server.ctx;
  const refreshToken = randomToken(32);
  const expiresAt = new Date(now().getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      refreshTokenHash: sha256(refreshToken),
      deviceLabel: deviceLabel ?? null,
      userAgent: request.headers["user-agent"]?.slice(0, 200) ?? null,
      ip: request.ip,
      expiresAt,
    })
    .returning({ id: sessions.id });
  const accessToken = await signAccessToken(
    env.JWT_SECRET,
    { userId: user.id, sessionId: session!.id, role: user.role },
    env.ACCESS_TOKEN_TTL_SECONDS,
  );
  return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, sessionId: session!.id };
}

export async function loadMe(db: DbOrTx, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      photoUrl: users.photoUrl,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw notFound("Conta não encontrada.");
  let student = null;
  if (user.role === "student") {
    const [profile] = await db
      .select({
        universityId: studentProfiles.universityId,
        universityName: universities.name,
        universityShortName: universities.shortName,
        studentNumber: studentProfiles.studentNumber,
        verificationStatus: studentProfiles.verificationStatus,
      })
      .from(studentProfiles)
      .leftJoin(universities, eq(universities.id, studentProfiles.universityId))
      .where(eq(studentProfiles.userId, userId));
    student = profile ?? null;
  }
  return { ...user, permissions: ROLE_PERMISSIONS[user.role], student };
}

export async function authRoutes(app: FastifyInstance) {
  const { db } = app.ctx;
  const strictLimit = { config: { rateLimit: { max: app.ctx.env.AUTH_RATE_LIMIT_PER_MINUTE, timeWindow: "1 minute" } } };

  app.post("/auth/register", strictLimit, async (request, reply) => {
    const body = parse(RegisterSchema, request.body);
    if (body.universityId) {
      const [uni] = await db
        .select({ id: universities.id })
        .from(universities)
        .where(and(eq(universities.id, body.universityId), eq(universities.active, true)));
      if (!uni) throw badRequest("Universidade inválida.", { fields: { universityId: "Universidade inválida." } });
    }
    const passwordHash = await hashPassword(body.password);
    const result = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          email: body.email,
          phone: body.phone ?? null,
          passwordHash,
          fullName: body.fullName,
          role: "student",
        })
        .returning({ id: users.id, role: users.role });
      await tx.insert(studentProfiles).values({
        userId: user!.id,
        universityId: body.universityId ?? null,
        studentNumber: body.studentNumber ?? null,
      });
      request.auth = { userId: user!.id, sessionId: "", role: "student", fullName: body.fullName };
      await audit(tx, request, { action: "user.register", entityType: "user", entityId: user!.id });
      const tokens = await issueSession(tx, request, user!, body.deviceLabel);
      return { tokens, userId: user!.id };
    });
    return reply.status(201).send({ ...result.tokens, user: await loadMe(db, result.userId) });
  });

  app.post("/auth/login", strictLimit, async (request) => {
    const body = parse(LoginSchema, request.body);
    const [user] = await db
      .select({ id: users.id, role: users.role, status: users.status, passwordHash: users.passwordHash, fullName: users.fullName })
      .from(users)
      .where(eq(sql`lower(${users.email})`, body.email));
    const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      await audit(db, request, { action: "auth.login", entityType: "user", entityId: user?.id ?? null, result: "failure" });
      throw unauthorized("Email ou palavra-passe incorrectos.");
    }
    if (user.status !== "active") throw new AppError(403, "account_disabled", "Esta conta está desactivada. Contacte o suporte.");
    request.auth = { userId: user.id, sessionId: "", role: user.role, fullName: user.fullName };
    const tokens = await issueSession(db, request, user, body.deviceLabel);
    await audit(db, request, { action: "auth.login", entityType: "user", entityId: user.id });
    return { ...tokens, user: await loadMe(db, user.id) };
  });

  app.post("/auth/refresh", async (request) => {
    const body = parse(z.object({ refreshToken: z.string().min(20) }), request.body);
    const { env, now } = app.ctx;
    const [row] = await db
      .select({ sessionId: sessions.id, userId: users.id, role: users.role, status: users.status })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.refreshTokenHash, sha256(body.refreshToken)), isNull(sessions.revokedAt), gt(sessions.expiresAt, now())),
      );
    if (!row || row.status !== "active") throw unauthorized();
    const refreshToken = randomToken(32);
    await db
      .update(sessions)
      .set({ refreshTokenHash: sha256(refreshToken), lastUsedAt: now() })
      .where(eq(sessions.id, row.sessionId));
    const accessToken = await signAccessToken(
      env.JWT_SECRET,
      { userId: row.userId, sessionId: row.sessionId, role: row.role },
      env.ACCESS_TOKEN_TTL_SECONDS,
    );
    return { accessToken, refreshToken, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request) => {
    await db.update(sessions).set({ revokedAt: app.ctx.now() }).where(eq(sessions.id, request.auth!.sessionId));
    return { ok: true };
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => loadMe(db, request.auth!.userId));

  app.patch("/me", { preHandler: requireAuth }, async (request) => {
    const body = parse(
      z.object({
        fullName: z.string().trim().min(3).max(120).optional(),
        phone: phoneSchema.nullable().optional(),
        photoUrl: z.string().url().max(500).nullable().optional(),
      }),
      request.body,
    );
    await db
      .update(users)
      .set({ ...body, updatedAt: app.ctx.now() })
      .where(eq(users.id, request.auth!.userId));
    await audit(db, request, { action: "user.update_profile", entityType: "user", entityId: request.auth!.userId });
    return loadMe(db, request.auth!.userId);
  });

  app.post("/me/password", { preHandler: requireAuth }, async (request) => {
    const body = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), request.body);
    const [user] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, request.auth!.userId));
    if (!user || !(await verifyPassword(body.currentPassword, user.hash))) {
      throw badRequest("A palavra-passe actual está incorrecta.", { fields: { currentPassword: "Incorrecta." } });
    }
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: app.ctx.now() })
      .where(eq(users.id, request.auth!.userId));
    // Termina as outras sessões; mantém a actual.
    await db
      .update(sessions)
      .set({ revokedAt: app.ctx.now() })
      .where(and(eq(sessions.userId, request.auth!.userId), isNull(sessions.revokedAt), sql`${sessions.id} <> ${request.auth!.sessionId}`));
    await audit(db, request, { action: "user.change_password", entityType: "user", entityId: request.auth!.userId });
    return { ok: true };
  });

  app.get("/me/sessions", { preHandler: requireAuth }, async (request) => {
    const rows = await db
      .select({
        id: sessions.id,
        deviceLabel: sessions.deviceLabel,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, request.auth!.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, app.ctx.now())))
      .orderBy(desc(sessions.lastUsedAt));
    return rows.map((r) => ({ ...r, current: r.id === request.auth!.sessionId }));
  });

  app.delete("/me/sessions/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(z.object({ id: z.string().uuid() }), request.params);
    const updated = await db
      .update(sessions)
      .set({ revokedAt: app.ctx.now() })
      .where(and(eq(sessions.id, id), eq(sessions.userId, request.auth!.userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (updated.length === 0) throw notFound("Sessão não encontrada.");
    await audit(db, request, { action: "session.revoke", entityType: "session", entityId: id });
    return { ok: true };
  });

  app.post("/auth/password/forgot", strictLimit, async (request) => {
    const body = parse(z.object({ email: emailSchema }), request.body);
    const { env, now } = app.ctx;
    const [user] = await db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(sql`lower(${users.email})`, body.email));
    let devCode: string | undefined;
    if (user && user.status === "active") {
      const code = randomNumericCode();
      await db.insert(passwordResets).values({
        userId: user.id,
        codeHash: sha256(`${user.id}:${code}`),
        expiresAt: new Date(now().getTime() + 15 * 60_000),
      });
      // O envio por SMS/email depende de um fornecedor ainda não configurado (ver docs/03-integracoes.md).
      request.log.info({ userId: user.id }, "código de recuperação gerado; envio não configurado");
      if (env.DEV_EXPOSE_RESET_CODES) devCode = code;
    }
    return {
      message: "Se existir uma conta com este email, enviámos um código de recuperação válido durante 15 minutos.",
      ...(devCode ? { devCode } : {}),
    };
  });

  app.post("/auth/password/reset", strictLimit, async (request) => {
    const body = parse(
      z.object({ email: emailSchema, code: z.string().regex(/^[0-9]{6}$/, "Código inválido."), newPassword: passwordSchema }),
      request.body,
    );
    const { now } = app.ctx;
    const invalid = () => badRequest("Código inválido ou expirado.", { fields: { code: "Código inválido ou expirado." } });
    const [user] = await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, body.email));
    if (!user) throw invalid();
    const [reset] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, now())))
      .orderBy(desc(passwordResets.createdAt))
      .limit(1);
    if (!reset || reset.attempts >= 5) throw invalid();
    if (reset.codeHash !== sha256(`${user.id}:${body.code}`)) {
      await db.update(passwordResets).set({ attempts: reset.attempts + 1 }).where(eq(passwordResets.id, reset.id));
      throw invalid();
    }
    await db.transaction(async (tx) => {
      await tx.update(passwordResets).set({ usedAt: now() }).where(eq(passwordResets.id, reset.id));
      await tx
        .update(users)
        .set({ passwordHash: await hashPassword(body.newPassword), updatedAt: now() })
        .where(eq(users.id, user.id));
      await tx.update(sessions).set({ revokedAt: now() }).where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt)));
      request.auth = null;
      await audit(tx, request, { action: "user.reset_password", entityType: "user", entityId: user.id });
    });
    return { message: "Palavra-passe alterada. Inicie sessão com a nova palavra-passe." };
  });
}
