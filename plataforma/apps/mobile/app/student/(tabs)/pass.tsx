import { LABELS } from "@uni/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { formatLongDate } from "../../../src/format.ts";
import { Avatar, Pill } from "../../../src/kit.tsx";
import type { MyPass, PassToken } from "../../../src/types.ts";
import { Body, Button, c, ErrorBox, Loading, Notice, errorMessage, useLoad, useRefreshOnFocus } from "../../../src/ui.tsx";

/** Pede um novo código alguns segundos antes de o anterior expirar. */
const RENEW_BEFORE_MS = 10_000;

export default function PassTab() {
  const insets = useSafeAreaInsets();
  const { me } = useAuth();
  const pass = useLoad(() => api<MyPass>("/passes/me"));
  useRefreshOnFocus(pass.reload);
  const [token, setToken] = useState<PassToken | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visible = useRef(false);
  const active = pass.data?.status === "active" && pass.data.pass !== null;

  const fetchToken = useCallback(async () => {
    try {
      const t = await api<PassToken>("/passes/me/token");
      if (!visible.current) return;
      setToken(t);
      setTokenError(null);
      const wait = Math.max(5_000, new Date(t.expiresAt).getTime() - Date.now() - RENEW_BEFORE_MS);
      timer.current = setTimeout(() => void fetchToken(), wait);
    } catch (err) {
      if (!visible.current) return;
      setToken(null);
      setTokenError(errorMessage(err));
    }
  }, []);

  // O código só é gerado enquanto o ecrã está visível, para não emitir tokens desnecessários.
  useFocusEffect(
    useCallback(() => {
      if (!active) return;
      visible.current = true;
      void fetchToken();
      return () => {
        visible.current = false;
        if (timer.current) clearTimeout(timer.current);
        setToken(null);
      };
    }, [active, fetchToken]),
  );

  useEffect(() => {
    if (!token) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((new Date(token.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [token]);

  const data = pass.data;
  const statusLabel = !data ? "" : active ? "Passe válido" : data.status === "none" ? "Sem plano" : LABELS.subscriptionStatus[data.status];

  return (
    <View style={s.page}>
      <View style={[s.orb, { top: -120, right: -110 }]} pointerEvents="none" />
      <View style={[s.orb, { bottom: 120, left: -170 }]} pointerEvents="none" />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, gap: 18 }}
        refreshControl={<RefreshControl refreshing={pass.loading} onRefresh={() => void pass.reload()} tintColor="#fff" />}
      >
        <View style={s.header}>
          <Text style={s.title}>Passe digital</Text>
          {data ? <Pill label={statusLabel} tone={active ? "success" : "neutral"} /> : null}
        </View>

        {pass.loading && !data ? <Loading /> : null}
        <ErrorBox message={pass.error} onRetry={() => void pass.reload()} />

        {data && !data.pass ? (
          <View style={s.ticket}>
            <View style={{ padding: 22, gap: 10 }}>
              <Text style={s.name}>Ainda não tem passe</Text>
              <Body muted>O passe digital é emitido automaticamente quando o pagamento de um plano é confirmado.</Body>
              <Button label="Escolher plano" onPress={() => router.push("/student/plans")} />
            </View>
          </View>
        ) : null}

        {data?.pass ? (
          <View style={s.ticket}>
            <View style={s.holder}>
              <Avatar name={me?.fullName} size={60} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.name}>{me?.fullName}</Text>
                {me?.student?.universityName ? <Body muted>{me.student.universityName}</Body> : null}
                {me?.student?.studentNumber ? <Body muted>Nº de estudante {me.student.studentNumber}</Body> : null}
              </View>
            </View>

            <View style={s.perforation}>
              <View style={[s.notch, { left: -12 }]} />
              <View style={s.dashes} />
              <View style={[s.notch, { right: -12 }]} />
            </View>

            {active ? (
              <View style={{ alignItems: "center", gap: 10, paddingHorizontal: 22, paddingBottom: 18 }}>
                <View style={s.qrBox}>{token ? <QRCode value={token.token} size={210} /> : <View style={{ width: 210, height: 210, justifyContent: "center" }}><Loading /></View>}</View>
                <Text style={{ color: c.textMuted, fontSize: 14 }}>O código muda a cada 60 segundos</Text>
                {token ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.success }} />
                    <Text style={{ fontWeight: "700", color: c.text }}>Actualiza em {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:{String(secondsLeft % 60).padStart(2, "0")}</Text>
                  </View>
                ) : null}
                <ErrorBox message={tokenError} onRetry={() => void fetchToken()} />
                {data.subscription?.requiresBooking ? <Notice>O seu plano exige reserva: o passe só é aceite nas viagens em que tem lugar reservado.</Notice> : null}
              </View>
            ) : (
              <View style={{ padding: 22 }}>
                <Notice tone="warning">O passe não está válido de momento. Verifique o estado do seu plano.</Notice>
              </View>
            )}

            <View style={s.footer}>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.footLabel}>Válido até</Text>
                  <Text style={s.footValue}>{data.subscription?.endDate ? formatLongDate(data.subscription.endDate) : "—"}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.footLabel}>ID do passe</Text>
                  <Text style={s.footValue}>{data.pass.publicCode}</Text>
                </View>
              </View>
              {data.subscription ? (
                <View style={{ gap: 2 }}>
                  <Text style={s.footLabel}>Plano</Text>
                  <Text style={[s.footValue, { fontSize: 16 }]}>
                    {data.subscription.planName}
                    {data.subscription.universityShortName ? ` · ${data.subscription.universityShortName}` : ""}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={s.hint}>Mostre este código ao motorista. Cada leitura só é aceite uma vez; capturas de ecrã não funcionam.</Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button label="Ver plano" variant="accent" onPress={() => router.push("/student/plans")} flex />
          <Button label="As minhas reservas" variant="light" onPress={() => router.push("/student/bookings")} flex />
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.primary, overflow: "hidden" },
  orb: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: c.primaryDark, opacity: 0.55 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#fff", fontSize: 28, fontWeight: "800" },
  ticket: { backgroundColor: "#fff", borderRadius: 28, overflow: "hidden", boxShadow: "0 16px 40px rgba(8, 20, 50, 0.35)" },
  holder: { flexDirection: "row", alignItems: "center", gap: 16, padding: 22, paddingBottom: 16 },
  name: { fontSize: 20, fontWeight: "800", color: c.text },
  perforation: { height: 24, justifyContent: "center", marginBottom: 14 },
  notch: { position: "absolute", width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary },
  dashes: { marginHorizontal: 20, borderTopWidth: 2, borderStyle: "dashed", borderColor: "#D3D9E4" },
  qrBox: { padding: 16, borderRadius: 20, backgroundColor: "#F6F8FB", borderWidth: 1, borderColor: "#E1E6EE" },
  footer: { backgroundColor: "#F3F5F9", padding: 20, gap: 14 },
  footLabel: { fontSize: 13, color: c.textMuted },
  footValue: { fontSize: 18, fontWeight: "800", color: c.text },
  hint: { color: "rgba(255,255,255,0.8)", fontSize: 13, textAlign: "center", lineHeight: 18 },
});
