import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditLogs, users } from "../src/db/schema.ts";
import { createTestApp, PASSWORD, type TestApp } from "./helpers.ts";

let t: TestApp;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(async () => {
  await t.close();
});

describe("autenticação", () => {
  it("regista um estudante sem conceder benefícios universitários automaticamente", async () => {
    await t.createUser("super_admin", "admin.registo@teste.ao");
    const adminToken = await t.login("admin.registo@teste.ao");
    const uni = await t.call<any>("POST", "/admin/universities", adminToken, { name: "Universidade Registo", shortName: "UREG", city: "Luanda" });
    const res = await t.call<any>("POST", "/auth/register", undefined, {
      fullName: "Joana Registo",
      email: "Joana.Registo@Teste.ao",
      password: "uma-palavra-passe",
      universityId: uni.body.id,
      studentNumber: "2026-001",
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.user.email).toBe("joana.registo@teste.ao");
    expect(res.body.user.role).toBe("student");
    expect(res.body.user.student.verificationStatus).toBe("not_submitted");
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const sub = await t.call("POST", "/subscriptions", res.body.accessToken, { planId: "00000000-0000-4000-8000-000000000000" });
    expect(sub.status).toBe(403);

    const dup = await t.call<any>("POST", "/auth/register", undefined, { fullName: "Outra", email: "joana.registo@teste.ao", password: "uma-palavra-passe" });
    expect(dup.status).toBe(409);
  });

  it("recusa credenciais erradas sem revelar se a conta existe", async () => {
    await t.createUser("student", "existe@teste.ao");
    const wrong = await t.call<any>("POST", "/auth/login", undefined, { email: "existe@teste.ao", password: "errada-errada" });
    const missing = await t.call<any>("POST", "/auth/login", undefined, { email: "naoexiste@teste.ao", password: "errada-errada" });
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body.error.message).toBe(missing.body.error.message);
  });

  it("roda o refresh token e invalida o anterior; terminar sessão revoga o acesso", async () => {
    await t.createUser("student", "sessao@teste.ao");
    const login = await t.call<any>("POST", "/auth/login", undefined, { email: "sessao@teste.ao", password: PASSWORD });
    const first = login.body.refreshToken;
    const refreshed = await t.call<any>("POST", "/auth/refresh", undefined, { refreshToken: first });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refreshToken).not.toBe(first);
    expect((await t.call("POST", "/auth/refresh", undefined, { refreshToken: first })).status).toBe(401);

    const token = refreshed.body.accessToken;
    expect((await t.call("GET", "/me", token)).status).toBe(200);
    expect((await t.call("POST", "/auth/logout", token)).status).toBe(200);
    expect((await t.call("GET", "/me", token)).status).toBe(401);
  });

  it("uma conta desactivada perde o acesso de imediato", async () => {
    const id = await t.createUser("student", "desactivar@teste.ao");
    const token = await t.login("desactivar@teste.ao");
    await t.handle.db.update(users).set({ status: "disabled" }).where(eq(users.id, id));
    expect((await t.call("GET", "/me", token)).status).toBe(401);
    const relogin = await t.call("POST", "/auth/login", undefined, { email: "desactivar@teste.ao", password: PASSWORD });
    expect(relogin.status).toBe(403);
  });

  it("recupera a palavra-passe com código de uso limitado e revoga sessões antigas", async () => {
    await t.createUser("student", "recuperar@teste.ao");
    const oldToken = await t.login("recuperar@teste.ao");
    const forgot = await t.call<any>("POST", "/auth/password/forgot", undefined, { email: "recuperar@teste.ao" });
    expect(forgot.status).toBe(200);
    const code = forgot.body.devCode as string;
    expect(code).toMatch(/^\d{6}$/);
    const unknown = await t.call<any>("POST", "/auth/password/forgot", undefined, { email: "ninguem@teste.ao" });
    expect(unknown.body.message).toBe(forgot.body.message);

    const bad = await t.call("POST", "/auth/password/reset", undefined, { email: "recuperar@teste.ao", code: code === "000000" ? "111111" : "000000", newPassword: "nova-palavra-passe" });
    expect(bad.status).toBe(400);
    const ok = await t.call("POST", "/auth/password/reset", undefined, { email: "recuperar@teste.ao", code, newPassword: "nova-palavra-passe" });
    expect(ok.status).toBe(200);
    expect((await t.call("GET", "/me", oldToken)).status).toBe(401);
    expect((await t.call("POST", "/auth/password/reset", undefined, { email: "recuperar@teste.ao", code, newPassword: "outra-palavra-passe" })).status).toBe(400);
    expect((await t.call("POST", "/auth/login", undefined, { email: "recuperar@teste.ao", password: "nova-palavra-passe" })).status).toBe(200);
  });
});

describe("autorização no servidor", () => {
  it("bloqueia pedidos sem sessão e perfis sem permissão, registando a recusa", async () => {
    expect((await t.call("GET", "/admin/universities")).status).toBe(401);

    const studentId = await t.createUser("student", "curioso@teste.ao");
    const student = await t.login("curioso@teste.ao");
    const denied = await t.call("POST", "/admin/universities", student, { name: "Universidade Pirata", shortName: "UPIR", city: "Luanda" });
    expect(denied.status).toBe(403);

    const driver = await t.createUser("driver", "motorista.rbac@teste.ao").then(() => t.login("motorista.rbac@teste.ao"));
    expect((await t.call("GET", "/admin/payments", driver)).status).toBe(403);
    expect((await t.call("POST", "/admin/payments/00000000-0000-4000-8000-000000000000/confirm", driver, {})).status).toBe(403);
    expect((await t.call("PATCH", "/admin/staff/00000000-0000-4000-8000-000000000000", driver, { role: "super_admin" })).status).toBe(403);

    const finance = await t.createUser("finance", "financeiro.rbac@teste.ao").then(() => t.login("financeiro.rbac@teste.ao"));
    expect((await t.call("POST", "/admin/vehicles", finance, { plate: "LD-99-99", model: "X", capacity: 10 })).status).toBe(403);

    const operator = await t.createUser("transport_operator", "operador.rbac@teste.ao").then(() => t.login("operador.rbac@teste.ao"));
    const staff = await t.call("POST", "/admin/staff", operator, { fullName: "Novo Admin", email: "novo.admin@teste.ao", role: "super_admin", temporaryPassword: "temporaria-123" });
    expect(staff.status).toBe(403);

    const logs = await t.handle.db.select().from(auditLogs).where(eq(auditLogs.actorId, studentId));
    expect(logs.some((l) => l.action === "access.denied" && l.result === "denied")).toBe(true);
  });

  it("o gestor de universidade só vê estudantes da sua universidade", async () => {
    const admin = await t.createUser("super_admin", "admin.scope@teste.ao").then(() => t.login("admin.scope@teste.ao"));
    const a = await t.call<any>("POST", "/admin/universities", admin, { name: "Universidade A", shortName: "UA-SC", city: "Luanda" });
    const b = await t.call<any>("POST", "/admin/universities", admin, { name: "Universidade B", shortName: "UB-SC", city: "Luanda" });
    await t.createUser("student", "aluno.a@teste.ao", { verifiedUniversityId: a.body.id });
    await t.createUser("student", "aluno.b@teste.ao", { verifiedUniversityId: b.body.id });
    await t.createUser("university_manager", "gestor.a@teste.ao", { universityIds: [a.body.id] });
    const manager = await t.login("gestor.a@teste.ao");
    const list = await t.call<any>("GET", "/admin/students?pageSize=100", manager);
    expect(list.status).toBe(200);
    const emails = list.body.items.map((s: any) => s.email);
    expect(emails).toContain("aluno.a@teste.ao");
    expect(emails).not.toContain("aluno.b@teste.ao");
  });
});
