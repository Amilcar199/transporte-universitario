import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { STAFF_ROLES, type Permission, type Role } from "@uni/shared";
import { api, clearSession, hasStoredSession, onUnauthorized, setSession } from "./api.ts";

export interface Me {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  permissions: Permission[];
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(hasStoredSession());

  useEffect(() => {
    onUnauthorized(() => {
      clearSession();
      setMe(null);
    });
    if (!hasStoredSession()) return;
    api<Me>("/me")
      .then((user) => (STAFF_ROLES.includes(user.role) ? setMe(user) : clearSession()))
      .catch(() => clearSession())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; refreshToken: string; user: Me }>("/auth/login", {
      method: "POST",
      body: { email, password, deviceLabel: "Painel administrativo" },
    });
    if (!STAFF_ROLES.includes(res.user.role)) {
      setSession(res);
      await api("/auth/logout", { method: "POST" }).catch(() => {});
      clearSession();
      throw new Error("Esta conta não tem acesso ao painel administrativo.");
    }
    setSession(res);
    setMe(res.user);
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
    setMe(null);
  }, []);

  const can = useCallback((permission: Permission) => me?.permissions.includes(permission) ?? false, [me]);

  return <AuthContext.Provider value={{ me, loading, login, logout, can }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora de AuthProvider");
  return ctx;
}
