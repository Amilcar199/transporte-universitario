import { formatKz, LABELS } from "@uni/shared";
import { router } from "expo-router";
import { useCallback } from "react";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { addMinutesToTime, formatDate, luandaToday } from "../../../src/format.ts";
import type { MyBooking, MySubscription, Notification } from "../../../src/types.ts";
import { Badge, Body, Button, Card, ErrorBox, Notice, Row, Screen, Subtitle, Title, useLoad, useRefreshOnFocus, type Tone } from "../../../src/ui.tsx";

const SUB_TONE: Record<string, Tone> = { active: "success", pending_payment: "warning", suspended: "danger", expired: "neutral", cancelled: "neutral" };

export default function StudentHome() {
  const { me, reload: reloadMe } = useAuth();
  const { data, error, loading, reload } = useLoad(async () => {
    const [subs, bookings, notifications] = await Promise.all([
      api<MySubscription[]>("/subscriptions/me"),
      api<MyBooking[]>("/bookings/me"),
      api<Notification[]>("/notifications"),
    ]);
    return { subs, bookings, notifications };
  });

  useRefreshOnFocus(
    useCallback(() => {
      void reload();
      void reloadMe().catch(() => undefined);
    }, [reload, reloadMe]),
  );

  const verification = me?.student?.verificationStatus ?? "not_submitted";
  const sub = data?.subs.find((s) => ["active", "pending_payment", "suspended"].includes(s.status)) ?? null;
  const today = luandaToday();
  const next = data?.bookings
    .filter((b) => b.status === "confirmed" && b.serviceDate >= today && b.tripStatus !== "cancelled")
    .sort((a, b) => `${a.serviceDate}${a.departureTime}`.localeCompare(`${b.serviceDate}${b.departureTime}`))[0];
  const unread = data?.notifications.filter((n) => !n.readAt).length ?? 0;

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <Title>Olá, {me?.fullName.split(" ")[0]}</Title>
      <ErrorBox message={error} onRetry={() => void reload()} />

      <Card>
        <Subtitle>Inscrição universitária</Subtitle>
        <Row>
          <Badge
            label={LABELS.verification[verification]}
            tone={verification === "approved" ? "success" : verification === "rejected" ? "danger" : verification === "pending" ? "warning" : "neutral"}
          />
          {me?.student?.universityShortName && verification === "approved" ? <Body>{me.student.universityName}</Body> : null}
        </Row>
        {verification !== "approved" ? (
          <>
            <Body muted>
              {verification === "pending"
                ? "O pedido está a ser analisado pela equipa da universidade."
                : "Confirme a sua inscrição para poder subscrever um plano de estudante."}
            </Body>
            {verification !== "pending" ? <Button label="Pedir confirmação" onPress={() => router.push("/student/verification")} /> : null}
          </>
        ) : null}
      </Card>

      <Card>
        <Subtitle>Plano</Subtitle>
        {sub ? (
          <>
            <Row>
              <Body>{sub.planName}</Body>
              <Badge label={LABELS.subscriptionStatus[sub.status]} tone={SUB_TONE[sub.status]} />
            </Row>
            {sub.status === "active" && sub.endDate ? <Body muted>Válido até {formatDate(sub.endDate)}</Body> : null}
            {sub.status === "pending_payment" ? <Body muted>Valor: {formatKz(sub.priceKz)}. O plano só fica activo depois de o pagamento ser confirmado.</Body> : null}
            {sub.statusReason ? <Body muted>Motivo: {sub.statusReason}</Body> : null}
          </>
        ) : (
          <Body muted>Não tem nenhum plano activo.</Body>
        )}
        <Button label={sub ? "Ver plano e pagamentos" : "Escolher plano"} variant="secondary" onPress={() => router.push("/student/plans")} />
      </Card>

      <Card>
        <Subtitle>Próxima viagem</Subtitle>
        {next ? (
          <>
            <Body>
              {next.routeCode} · {formatDate(next.serviceDate)} · partida às {next.departureTime}
            </Body>
            <Body muted>
              Embarque em {next.stopName}
              {next.minutesFromStart !== null ? ` (previsto ${addMinutesToTime(next.departureTime, next.minutesFromStart)})` : ""} · Lugar {next.seatNumber}
            </Body>
            <Button label="Acompanhar" variant="secondary" onPress={() => router.push(`/student/live/${next.tripId}`)} />
          </>
        ) : (
          <>
            <Body muted>Sem reservas futuras.</Body>
            <Button label="Ver rotas" variant="secondary" onPress={() => router.push("/student/routes")} />
          </>
        )}
      </Card>

      {unread > 0 ? (
        <Notice>
          Tem {unread} {unread === 1 ? "notificação nova" : "notificações novas"}.
        </Notice>
      ) : null}
      <Button label="Notificações" variant="secondary" onPress={() => router.push("/student/notifications")} />
    </Screen>
  );
}
