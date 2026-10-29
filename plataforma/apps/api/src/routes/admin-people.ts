import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { ROLES, STAFF_ROLES, VERIFICATION_STATUSES, type Role } from "@uni/shared";
import { audit } from "../audit.ts";
import { hashPassword } from "../auth/crypto.ts";
import { can } from "../auth/guard.ts";
import type { DbOrTx } from "../db/client.ts";
import {
  partnerCarriers,
  partnerValidators,
  sessions,
  studentProfiles,
  studentVerifications,
  universities,
  universityManagers,
  users,
} from "../db/schema.ts";
import { badRequest, forbidden, notFound, parse } from "../errors.ts";
import { ilikeAny, notify, PageQuery, uuidParam } from "../lib.ts";
import { emailSchema, passwordSchema, phoneSchema } from "./auth.ts";

const staffRoleSchema = z.enum(STAFF_ROLES as [Role, ...Role[]], { message: "Perfil inválido." });

const StaffCreate = z.object({
  fullName: z.string().trim().min(3, "Indique o nome completo.").max(120),
  email: emailSchema,
  phone: phoneSchema.optional(),
  role: staffRoleSchema,
  temporaryPassword: passwordSchema,
  universityIds: z.array(z.string().uuid()).max(20).default([]),
  carrierIds: z.array(z.string().uuid()).max(20).default([]),
});

const StaffUpdate = z.object({
  fullName: z.string().trim().min(3).max(120).optional(),
  phone: phoneSchema.optional(),
  role: staffRoleSchema.optional(),
  status: z.enum(["active", "disabled"]).optional(),
  universityIds: z.array(z.string().uuid()).max(20).optional(),
  carrierIds: z.array(z.string().uuid()).max(20).optional(),
});

const VerificationDecision = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).optional(),
});

/**
 * Universidades que o utilizador pode gerir. `null` significa sem restrição.
 * Um gestor de universidade só vê estudantes das universidades que lhe foram atribuídas.
 */
export async function managedUniversityIds(db: DbOrTx, request: FastifyRequest): Promise<string[] | null> {
  if (request.auth!.role !== "university_manager") return null;
  const rows = await db
    .select({ id: universityManagers.universityId })
    .from(universityManagers)
    .where(eq(universityManagers.userId, request.auth!.userId));
  return rows.map((r) => r.id);
}

async function loadStaff(db: DbOrTx, id: string) {
  const [user] = await db
    .select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, role: users.role, status: users.status, isDemo: users.isDemo, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.id, id), inArray(users.role, [...STAFF_ROLES])));
  if (!user) throw notFound("Utilizador não encontrado.");
  const managed = await db
    .select({ id: universities.id, shortName: universities.shortName })
    .from(universityManagers)
    .innerJoin(universities, eq(universities.id, universityManagers.universityId))
    .where(eq(universityManagers.userId, id));
  const carriers = await db
    .select({ id: partnerCarriers.id, name: partnerCarriers.name })
    .from(partnerValidators)
    .innerJoin(partnerCarriers, eq(partnerCarriers.id, partnerValidators.carrierId))
    .where(eq(partnerValidators.userId, id));
  return { ...user, universities: managed, carriers };
}

/** Âmbito do perfil: universidades do gestor ou transportadoras do validador. Outros perfis não têm âmbito. */
async function setStaffScope(db: DbOrTx, userId: string, role: Role, scope: { universityIds: string[]; carrierIds: string[] }) {
  await db.delete(universityManagers).where(eq(universityManagers.userId, userId));
  await db.delete(partnerValidators).where(eq(partnerValidators.userId, userId));
  if (role === "university_manager") {
    if (scope.universityIds.length === 0) {
      throw badRequest("Atribua pelo menos uma universidade ao gestor.", { fields: { universityIds: "Obrigatório." } });
    }
    await db.insert(universityManagers).values(scope.universityIds.map((universityId) => ({ userId, universityId })));
  }
  if (role === "partner_validator") {
    if (scope.carrierIds.length === 0) {
      throw badRequest("Associe o validador a pelo menos uma transportadora parceira.", { fields: { carrierIds: "Obrigatório." } });
    }
    await db.insert(partnerValidators).values(scope.carrierIds.map((carrierId) => ({ userId, carrierId })));
  }
}

export async function adminPeopleRoutes(app: FastifyInstance) {
  const { db } = app.ctx;

  // ------------------------------------------------------------ Equipa (perfis internos)
  app.get("/admin/staff", { preHandler: can("users.manage") }, async (request) => {
    const q = parse(PageQuery.extend({ role: z.enum(ROLES).optional() }), request.query);
    const where = and(
      inArray(users.role, [...STAFF_ROLES]),
      q.role ? eq(users.role, q.role) : undefined,
      ilikeAny(q.search, sql`${users.fullName}`, sql`${users.email}`),
    );
    const [items, total] = await Promise.all([
      db
        .select({ id: users.id, fullName: users.fullName, email: users.email, phone: users.phone, role: users.role, status: users.status, isDemo: users.isDemo })
        .from(users)
        .where(where)
        .orderBy(users.fullName)
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(users, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.get("/admin/staff/:id", { preHandler: can("users.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    return loadStaff(db, id);
  });

  app.post("/admin/staff", { preHandler: can("users.manage") }, async (request, reply) => {
    const body = parse(StaffCreate, request.body);
    if (body.role === "super_admin" && request.auth!.role !== "super_admin") throw forbidden();
    const passwordHash = await hashPassword(body.temporaryPassword);
    const id = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ fullName: body.fullName, email: body.email, phone: body.phone ?? null, role: body.role, passwordHash })
        .returning({ id: users.id });
      await setStaffScope(tx, user!.id, body.role, body);
      await audit(tx, request, { action: "staff.create", entityType: "user", entityId: user!.id, details: { role: body.role } });
      return user!.id;
    });
    return reply.status(201).send(await loadStaff(db, id));
  });

  app.patch("/admin/staff/:id", { preHandler: can("users.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(StaffUpdate, request.body);
    if (id === request.auth!.userId && (body.role || body.status === "disabled")) {
      throw badRequest("Não pode alterar o seu próprio perfil nem desactivar a sua conta.");
    }
    await db.transaction(async (tx) => {
      const current = await loadStaff(tx, id);
      if ((current.role === "super_admin" || body.role === "super_admin") && request.auth!.role !== "super_admin") throw forbidden();
      const role = body.role ?? current.role;
      await tx
        .update(users)
        .set({ fullName: body.fullName, phone: body.phone, role: body.role, status: body.status, updatedAt: app.ctx.now() })
        .where(eq(users.id, id));
      if (body.universityIds !== undefined || body.carrierIds !== undefined || body.role !== undefined) {
        await setStaffScope(tx, id, role, {
          universityIds: body.universityIds ?? current.universities.map((u) => u.id),
          carrierIds: body.carrierIds ?? current.carriers.map((c) => c.id),
        });
      }
      if (body.status === "disabled" || (body.role && body.role !== current.role)) {
        await tx.update(sessions).set({ revokedAt: app.ctx.now() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} is null`));
      }
      await audit(tx, request, { action: "staff.update", entityType: "user", entityId: id, details: { fields: Object.keys(body), role } });
    });
    return loadStaff(db, id);
  });

  // ------------------------------------------------------------ Estudantes
  app.get("/admin/students", { preHandler: can("students.read") }, async (request) => {
    const q = parse(
      PageQuery.extend({ universityId: z.string().uuid().optional(), verification: z.enum(VERIFICATION_STATUSES).optional() }),
      request.query,
    );
    const scope = await managedUniversityIds(db, request);
    if (scope && scope.length === 0) return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
    const where = and(
      eq(users.role, "student"),
      scope ? inArray(studentProfiles.universityId, scope) : undefined,
      q.universityId ? eq(studentProfiles.universityId, q.universityId) : undefined,
      q.verification ? eq(studentProfiles.verificationStatus, q.verification) : undefined,
      ilikeAny(q.search, sql`${users.fullName}`, sql`${users.email}`, sql`coalesce(${studentProfiles.studentNumber}, '')`),
    );
    const base = db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        status: users.status,
        isDemo: users.isDemo,
        universityId: studentProfiles.universityId,
        universityShortName: universities.shortName,
        studentNumber: studentProfiles.studentNumber,
        verificationStatus: studentProfiles.verificationStatus,
      })
      .from(users)
      .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
      .leftJoin(universities, eq(universities.id, studentProfiles.universityId))
      .where(where);
    const [items, [{ total } = { total: 0 }]] = await Promise.all([
      base.orderBy(users.fullName).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(users)
        .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
        .where(where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.patch("/admin/students/:id", { preHandler: can("users.manage") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(z.object({ status: z.enum(["active", "disabled"]) }), request.body);
    const [updated] = await db
      .update(users)
      .set({ status: body.status, updatedAt: app.ctx.now() })
      .where(and(eq(users.id, id), eq(users.role, "student")))
      .returning({ id: users.id, status: users.status });
    if (!updated) throw notFound("Estudante não encontrado.");
    if (body.status === "disabled") {
      await db.update(sessions).set({ revokedAt: app.ctx.now() }).where(and(eq(sessions.userId, id), sql`${sessions.revokedAt} is null`));
    }
    await audit(db, request, { action: "student.status", entityType: "user", entityId: id, details: { status: body.status } });
    return updated;
  });

  // ------------------------------------------------------------ Verificação universitária
  app.get("/admin/verifications", { preHandler: can("students.read") }, async (request) => {
    const q = parse(PageQuery.extend({ status: z.enum(VERIFICATION_STATUSES).default("pending") }), request.query);
    const scope = await managedUniversityIds(db, request);
    if (scope && scope.length === 0) return { items: [], total: 0, page: q.page, pageSize: q.pageSize };
    const where = and(
      eq(studentVerifications.status, q.status),
      scope ? inArray(studentVerifications.universityId, scope) : undefined,
    );
    const [items, total] = await Promise.all([
      db
        .select({
          id: studentVerifications.id,
          status: studentVerifications.status,
          studentNumber: studentVerifications.studentNumber,
          documentNote: studentVerifications.documentNote,
          decisionNote: studentVerifications.decisionNote,
          createdAt: studentVerifications.createdAt,
          decidedAt: studentVerifications.decidedAt,
          studentId: users.id,
          studentName: users.fullName,
          studentEmail: users.email,
          universityId: universities.id,
          universityShortName: universities.shortName,
        })
        .from(studentVerifications)
        .innerJoin(users, eq(users.id, studentVerifications.userId))
        .innerJoin(universities, eq(universities.id, studentVerifications.universityId))
        .where(where)
        .orderBy(desc(studentVerifications.createdAt))
        .limit(q.pageSize)
        .offset((q.page - 1) * q.pageSize),
      db.$count(studentVerifications, where),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });

  app.post("/admin/verifications/:id/decision", { preHandler: can("students.verify") }, async (request) => {
    const { id } = parse(uuidParam, request.params);
    const body = parse(VerificationDecision, request.body);
    if (body.decision === "rejected" && !body.note) throw badRequest("Indique o motivo da rejeição.", { fields: { note: "Obrigatório." } });
    const scope = await managedUniversityIds(db, request);
    return db.transaction(async (tx) => {
      const [v] = await tx.select().from(studentVerifications).where(eq(studentVerifications.id, id)).for("update");
      if (!v) throw notFound("Pedido de verificação não encontrado.");
      if (scope && !scope.includes(v.universityId)) throw forbidden();
      if (v.status !== "pending") throw badRequest("Este pedido já foi decidido.");
      const now = app.ctx.now();
      await tx
        .update(studentVerifications)
        .set({ status: body.decision, reviewerId: request.auth!.userId, decisionNote: body.note ?? null, decidedAt: now })
        .where(eq(studentVerifications.id, id));
      await tx
        .update(studentProfiles)
        .set(
          body.decision === "approved"
            ? { verificationStatus: "approved", universityId: v.universityId, studentNumber: v.studentNumber, updatedAt: now }
            : { verificationStatus: "rejected", updatedAt: now },
        )
        .where(eq(studentProfiles.userId, v.userId));
      await notify(tx, {
        userId: v.userId,
        title: body.decision === "approved" ? "Estatuto de estudante confirmado" : "Verificação recusada",
        body:
          body.decision === "approved"
            ? "A sua inscrição universitária foi confirmada. Já pode subscrever um plano."
            : `O pedido de verificação foi recusado: ${body.note}`,
        kind: "verification",
        dedupeKey: `verification:${id}`,
      });
      await audit(tx, request, { action: `verification.${body.decision}`, entityType: "student_verification", entityId: id, details: { studentId: v.userId } });
      return { id, status: body.decision };
    });
  });
}
