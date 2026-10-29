import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { api, clearSession, onUnauthorized, resumeSession, setSession } from "./api.ts";
import type { Me } from "./types.ts";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login(email: string, password: string): Promise<Me>;
  register(input: { fullName: string; email: string; phone?: string; password: string }): Promise<Me>;
  logout(): Promise<void>;
  reload(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const deviceLabel = `App ${Platform.OS}`;

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: Me;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    onUnauthorized(() => {
      void clearSession();
      setMe(null);
    });
    (async () => {
      try {
        if (await resumeSession()) setMe(await api<Me>("/me"));
      } catch {
        setMe(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<SessionResponse>("/auth/login", { method: "POST", body: { email, password, deviceLabel } });
    await setSession(res);
    setMe(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (input: { fullName: string; email: string; phone?: string; password: string }) => {
    const res = await api<SessionResponse>("/auth/register", { method: "POST", body: { ...input, deviceLabel } });
    await setSession(res);
    setMe(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      // A sessão local é terminada mesmo sem ligação; o servidor expira-a por si.
    }
    await clearSession();
    setMe(null);
  }, []);

  const reload = useCallback(async () => {
    setMe(await api<Me>("/me"));
  }, []);

  const value = useMemo(() => ({ me, loading, login, register, logout, reload }), [me, loading, login, register, logout, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fora de AuthProvider");
  return ctx;
}
