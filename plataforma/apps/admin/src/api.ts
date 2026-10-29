/**
 * Cliente da API. O token de acesso fica só em memória; o refresh token fica em sessionStorage
 * (termina ao fechar o separador). A autorização real é sempre decidida pelo servidor.
 */
const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";
const REFRESH_KEY = "admin.refresh";

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

export function setSession(tokens: { accessToken: string; refreshToken: string }) {
  accessToken = tokens.accessToken;
  sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearSession() {
  accessToken = null;
  sessionStorage.removeItem(REFRESH_KEY);
}

export function hasStoredSession() {
  return sessionStorage.getItem(REFRESH_KEY) !== null;
}

export function onUnauthorized(handler: () => void) {
  onSessionLost = handler;
}

async function refresh(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  setSession(await res.json());
  return true;
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  if (!accessToken && retry && hasStoredSession()) {
    refreshing ??= refresh().finally(() => (refreshing = null));
    await refreshing;
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Não foi possível contactar o servidor. Verifique a ligação.");
  }
  if (res.status === 401 && retry && path !== "/auth/login") {
    refreshing ??= refresh().finally(() => (refreshing = null));
    if (await refreshing) return api<T>(path, options, false);
    onSessionLost();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? "error", err?.message ?? "Ocorreu um erro inesperado.", err?.details?.fields);
  }
  return data as T;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
}
