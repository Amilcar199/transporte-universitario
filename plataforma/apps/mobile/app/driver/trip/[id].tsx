import { LABELS } from "@uni/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { api } from "../../../src/api.ts";
import { addMinutesToTime, formatDate, formatDateTime } from "../../../src/format.ts";
import type { DriverTripDetail } from "../../../src/types.ts";
import { useTripLocation, type LocationState } from "../../../src/use-trip-location.ts";
import { Badge, Body, Button, Card, Empty, ErrorBox, Loading, Notice, Row, Screen, Subtitle, errorMessage, useLoad, type Tone } from "../../../src/ui.tsx";

const BOOKING_TONE: Record<string, Tone> = { confirmed: "warning", boarded: "success", no_show: "danger", cancelled: "neutral" };

function LocationStatus({ state }: { state: LocationState }) {
  switch (state.kind) {
    case "off":
      return null;
    case "requesting":
      return <Notice>A pedir autorização de localização…</Notice>;
    case "denied":
      return <Notice tone="danger">Sem autorização de localização: os estudantes não conseguem acompanhar o autocarro. Autorize nas definições do telemóvel.</Notice>;
    case "error":
      return <Notice tone="danger">{state.message}</Notice>;
    case "sharing":
      return (
        <Notice tone="success">
          A partilhar a localização enquanto este ecrã estiver aberto.
          {state.lastSentAt ? ` Último envio: ${formatDateTime(state.lastSentAt.toISOString())}.` : " A aguardar a primeira posição."}
          {state.pending > 0 ? ` ${state.pending} posições por enviar.` : ""}
        </Notice>
      );
  }
}

export default function DriverTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const trip = useLoad(() => api<DriverTripDetail>(`/driver/trips/${id}`), [id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishInfo, setFinishInfo] = useState<string | null>(null);
  const location = useTripLocation(id, trip.data?.status === "in_progress");

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await trip.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  if (trip.loading && !trip.data) return <Loading />;
  if (!trip.data) return <Screen><ErrorBox message={trip.error} onRetry={() => void trip.reload()} /></Screen>;
  const t = trip.data;
  const boarded = t.manifest.filter((m) => m.status === "boarded").length;
  const expected = t.manifest.filter((m) => m.status === "confirmed" || m.status === "boarded").length;

  return (
    <Screen onRefresh={() => void trip.reload()} refreshing={trip.loading}>
      <Stack.Screen options={{ title: `${t.route.code} · ${t.departureTime}` }} />
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Subtitle>
            {formatDate(t.serviceDate)} · {t.departureTime}
          </Subtitle>
          <Badge label={LABELS.tripStatus[t.status]} tone={t.status === "in_progress" ? "info" : t.status === "completed" ? "success" : t.status === "cancelled" ? "danger" : "neutral"} />
        </Row>
        <Body>{t.route.name}</Body>
        <Body muted>
          {t.vehicle?.plate} {t.vehicle?.model ? `· ${t.vehicle.model}` : ""} · {t.capacity} lugares
        </Body>
        <Body muted>
          Embarcados: {boarded} de {expected} reservas
        </Body>
      </Card>

      <ErrorBox message={error} />
      {finishInfo ? <Notice tone="success">{finishInfo}</Notice> : null}
      <LocationStatus state={location} />

      {t.status === "scheduled" ? (
        <Button label="Iniciar viagem" busy={busy === "start"} onPress={() => void run("start", () => api(`/driver/trips/${t.id}/start`, { method: "POST" }))} />
      ) : null}
      {t.status === "in_progress" ? (
        <>
          <Button label="Validar passes (câmara)" onPress={() => router.push(`/driver/scan/${t.id}`)} />
          {confirmFinish ? (
            <Card>
              <Body>Terminar a viagem? As reservas sem embarque ficam registadas como «não compareceu».</Body>
              <Row>
                <Button
                  label="Terminar"
                  variant="danger"
                  busy={busy === "finish"}
                  onPress={() =>
                    void run("finish", async () => {
                      const res = await api<{ noShows: number }>(`/driver/trips/${t.id}/finish`, { method: "POST" });
                      setFinishInfo(`Viagem terminada. ${res.noShows} reserva(s) sem embarque.`);
                      setConfirmFinish(false);
                    })
                  }
                />
                <Button label="Continuar viagem" variant="secondary" onPress={() => setConfirmFinish(false)} />
              </Row>
            </Card>
          ) : (
            <Button label="Terminar viagem" variant="secondary" onPress={() => setConfirmFinish(true)} />
          )}
        </>
      ) : null}

      <Card>
        <Subtitle>Paragens</Subtitle>
        {t.route.stops.map((s) => (
          <Row key={s.routeStopId} style={{ justifyContent: "space-between" }}>
            <Body style={{ flex: 1 }}>
              {s.position}. {s.name}
            </Body>
            <Body muted>{addMinutesToTime(t.departureTime, s.minutesFromStart)}</Body>
          </Row>
        ))}
      </Card>

      <Card>
        <Subtitle>Passageiros</Subtitle>
        {t.manifest.length === 0 ? <Empty>Sem reservas nesta viagem.</Empty> : null}
        {t.manifest.map((m) => (
          <Row key={m.bookingId} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
            <Body style={{ flex: 1 }}>
              {m.seatNumber}. {m.studentName} · {m.stopName}
            </Body>
            <Badge label={LABELS.bookingStatus[m.status]} tone={BOOKING_TONE[m.status]} />
            {t.status === "in_progress" && m.status === "confirmed" ? (
              <Button
                label="Embarcou"
                variant="secondary"
                busy={busy === m.bookingId}
                onPress={() => void run(m.bookingId, () => api(`/driver/trips/${t.id}/bookings/${m.bookingId}/board`, { method: "POST" }))}
              />
            ) : null}
          </Row>
        ))}
        <Body muted>Prefira validar o passe com a câmara; use «Embarcou» quando o estudante não conseguir mostrar o código.</Body>
      </Card>
    </Screen>
  );
}
