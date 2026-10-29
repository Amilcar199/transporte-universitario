import { secureStorage } from "./storage.ts";

/** Endereço público da API; não é um segredo. Ver `.env.example`. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");
const REFRESH_KEY = "unirota.refresh";

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: () => void = () => {};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  await secureStorage.set(REFRESH_KEY, tokens.refreshToken);
}

export async function clearSession() {
  accessToken = null;
  await secureStorage.remove(REFRESH_KEY);
}

export function onUnauthorized(handler: () => void) {
  onSessionLost = handler;
}

async function refresh(): Promise<boolean> {
  const refreshToken = await secureStorage.get(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      await clearSession();
      return false;
    }
    await setSession(await res.json());
    return true;
  } catch {
    return false;
  }
}

/** Tenta retomar a sessão guardada. Devolve falso se não existir ou tiver sido revogada. */
export function resumeSession(): Promise<boolean> {
  refreshing ??= refresh().finally(() => (refreshing = null));
  return refreshing;
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Não foi possível contactar o servidor. Verifique a ligação à Internet.");
  }
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await resumeSession()) return api<T>(path, options, false);
    onSessionLost();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Ocorreu um erro inesperado.", err?.details?.fields);
  }
  return data as T;
}

/** Chave de idempotência para uma intenção de pagamento. Não é secreta; só tem de ser única por intenção. */
export function newIdempotencyKey(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
