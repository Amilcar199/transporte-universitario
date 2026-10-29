import { errors, jwtVerify, SignJWT } from "jose";
import { ROLES, type Role } from "@uni/shared";

export interface AccessClaims {
  userId: string;
  sessionId: string;
  role: Role;
}

const encoder = new TextEncoder();

export async function signAccessToken(secret: string, claims: AccessClaims, ttlSeconds: number): Promise<string> {
  return new SignJWT({ sid: claims.sessionId, role: claims.role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .setAudience("uni-api")
    .sign(encoder.encode(secret));
}

export async function verifyAccessToken(secret: string, token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), { algorithms: ["HS256"], audience: "uni-api" });
    const role = payload.role;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || !ROLES.includes(role as Role)) return null;
    return { userId: payload.sub, sessionId: payload.sid, role: role as Role };
  } catch {
    return null;
  }
}

/**
 * Token do passe digital mostrado em QR. Contém apenas o identificador do passe e um identificador
 * único (jti) para impedir reutilização; nenhum dado pessoal, financeiro ou credencial.
 */
export interface PassClaims {
  passId: string;
  jti: string;
}

export async function signPassToken(secret: string, claims: PassClaims, now: Date, ttlSeconds: number): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ pid: claims.passId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setJti(claims.jti)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ttlSeconds)
    .setAudience("uni-pass")
    .sign(encoder.encode(secret));
}

export type PassTokenResult = { ok: true; claims: PassClaims } | { ok: false; reason: "token_expired" | "token_invalid" };

export async function verifyPassToken(secret: string, token: string, now: Date): Promise<PassTokenResult> {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ["HS256"],
      audience: "uni-pass",
      currentDate: now,
      clockTolerance: 5,
    });
    if (typeof payload.pid !== "string" || typeof payload.jti !== "string") return { ok: false, reason: "token_invalid" };
    return { ok: true, claims: { passId: payload.pid, jti: payload.jti } };
  } catch (err) {
    return { ok: false, reason: err instanceof errors.JWTExpired ? "token_expired" : "token_invalid" };
  }
}
