import { LABELS } from "@uni/shared";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api } from "../../../src/api.ts";
import { formatDate } from "../../../src/format.ts";
import type { MyPass, PassToken } from "../../../src/types.ts";
import { Badge, Body, Button, Card, ErrorBox, Loading, Notice, Row, Screen, Subtitle, errorMessage, useLoad, useRefreshOnFocus } from "../../../src/ui.tsx";

/** Pede um novo código alguns segundos antes de o anterior expirar. */
const RENEW_BEFORE_MS = 10_000;

export default function PassTab() {
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

  if (pass.loading && !pass.data) return <Loading />;
  const data = pass.data;

  return (
    <Screen onRefresh={() => void pass.reload()} refreshing={pass.loading}>
      <ErrorBox message={pass.error} onRetry={() => void pass.reload()} />
      {data && !data.pass ? (
        <Card>
          <Subtitle>Ainda não tem passe</Subtitle>
          <Body muted>O passe digital é emitido automaticamente quando o pagamento de um plano é confirmado.</Body>
          <Button label="Escolher plano" onPress={() => router.push("/student/plans")} />
        </Card>
      ) : null}

      {data?.pass ? (
        <Card style={{ alignItems: "center" }}>
          <Row>
            <Subtitle>Passe {data.pass.publicCode}</Subtitle>
            <Badge
              label={data.status === "none" ? "Sem plano" : LABELS.subscriptionStatus[data.status]}
              tone={data.status === "active" ? "success" : data.status === "suspended" ? "danger" : "neutral"}
            />
          </Row>
          {data.subscription ? (
            <Body muted>
              {data.subscription.planName}
              {data.subscription.universityShortName ? ` · ${data.subscription.universityShortName}` : ""}
              {data.subscription.endDate ? ` · válido até ${formatDate(data.subscription.endDate)}` : ""}
            </Body>
          ) : null}

          {active ? (
            <>
              <View style={{ padding: 16, backgroundColor: "#fff", borderRadius: 12 }}>
                {token ? <QRCode value={token.token} size={240} /> : <Loading />}
              </View>
              {token ? <Body muted>Novo código em {secondsLeft} s</Body> : null}
              <ErrorBox message={tokenError} onRetry={() => void fetchToken()} />
              {data.subscription?.requiresBooking ? <Notice>O seu plano exige reserva: o passe só é aceite nas viagens em que tem lugar reservado.</Notice> : null}
              <Body muted style={{ textAlign: "center" }}>
                Mostre este código ao motorista. O código muda automaticamente e cada leitura só é aceite uma vez; capturas de ecrã não funcionam.
              </Body>
            </>
          ) : (
            <Notice tone="warning">O passe não está válido de momento. Verifique o estado do seu plano.</Notice>
          )}
        </Card>
      ) : null}
    </Screen>
  );
}
