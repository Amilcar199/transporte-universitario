import { LABELS } from "@uni/shared";
import { router } from "expo-router";
import { useState } from "react";
import { api } from "../../src/api.ts";
import { addMinutesToTime, formatDate, luandaToday } from "../../src/format.ts";
import type { MyBooking } from "../../src/types.ts";
import { Badge, Body, Button, Card, Empty, ErrorBox, Loading, Row, Screen, Subtitle, errorMessage, useLoad, useRefreshOnFocus, type Tone } from "../../src/ui.tsx";

const TONE: Record<string, Tone> = { confirmed: "success", boarded: "info", cancelled: "neutral", no_show: "danger" };

export default function BookingsTab() {
  const { data, error, loading, reload } = useLoad(() => api<MyBooking[]>("/bookings/me"));
  useRefreshOnFocus(reload);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const today = luandaToday();

  async function cancel(id: string) {
    setBusy(true);
    setActionError(null);
    try {
      await api(`/bookings/${id}/cancel`, { method: "POST" });
      setConfirming(null);
      await reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const upcoming = data?.filter((b) => b.serviceDate >= today && ["confirmed", "boarded"].includes(b.status) && b.tripStatus !== "completed") ?? [];
  const past = data?.filter((b) => !upcoming.includes(b)) ?? [];

  const renderBooking = (b: MyBooking) => (
    <Card key={b.id}>
      <Row style={{ justifyContent: "space-between" }}>
        <Body>
          {b.routeCode} · {formatDate(b.serviceDate)} · {b.departureTime}
        </Body>
        <Badge label={LABELS.bookingStatus[b.status]} tone={TONE[b.status]} />
      </Row>
      <Body muted>
        {b.stopName}
        {b.minutesFromStart !== null ? ` · previsto ${addMinutesToTime(b.departureTime, b.minutesFromStart)}` : ""} · Lugar {b.seatNumber}
      </Body>
      {b.tripStatus === "cancelled" ? <Badge label="Viagem cancelada" tone="danger" /> : null}
      {upcoming.includes(b) && b.tripStatus !== "cancelled" ? (
        <Row>
          <Button label="Acompanhar" variant="secondary" onPress={() => router.push(`/student/live/${b.tripId}`)} />
          {b.status === "confirmed" && b.tripStatus === "scheduled" ? (
            confirming === b.id ? (
              <>
                <Button label="Confirmar cancelamento" variant="danger" busy={busy} onPress={() => void cancel(b.id)} />
                <Button label="Manter" variant="secondary" onPress={() => setConfirming(null)} />
              </>
            ) : (
              <Button label="Cancelar reserva" variant="secondary" onPress={() => setConfirming(b.id)} />
            )
          ) : null}
        </Row>
      ) : null}
    </Card>
  );

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <ErrorBox message={error ?? actionError} onRetry={error ? () => void reload() : undefined} />
      {loading && !data ? <Loading /> : null}
      <Subtitle>Próximas</Subtitle>
      {data && upcoming.length === 0 ? <Empty>Sem reservas futuras. Escolha uma rota no separador Rotas.</Empty> : null}
      {upcoming.map(renderBooking)}
      {past.length > 0 ? <Subtitle>Histórico (últimos 14 dias)</Subtitle> : null}
      {past.map(renderBooking)}
    </Screen>
  );
}
