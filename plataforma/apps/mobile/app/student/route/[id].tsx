import { LABELS } from "@uni/shared";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../../../src/api.ts";
import { addDays, addMinutesToTime, formatDate, formatDays, luandaToday } from "../../../src/format.ts";
import type { RouteDetail, TripAvailability } from "../../../src/types.ts";
import {
  Badge,
  Body,
  Button,
  c,
  Card,
  Chip,
  DemoTag,
  Empty,
  ErrorBox,
  Loading,
  Notice,
  Row,
  Screen,
  Subtitle,
  Title,
  errorMessage,
  useLoad,
} from "../../../src/ui.tsx";

const DAYS_AHEAD = 7;

export default function RouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = luandaToday();
  const [date, setDate] = useState(today);
  const [stopId, setStopId] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ seatNumber: number } | null>(null);

  const route = useLoad(() => api<RouteDetail>(`/routes/${id}`), [id]);
  const trips = useLoad(() => api<TripAvailability[]>(`/routes/${id}/trips?date=${date}`), [id, date]);

  async function book() {
    if (!tripId || !stopId) return;
    setBusy(true);
    setBookError(null);
    try {
      const res = await api<{ seatNumber: number }>("/bookings", { method: "POST", body: { tripId, stopId } });
      setBooked(res);
      void trips.reload();
    } catch (err) {
      setBookError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (route.loading && !route.data) return <Loading />;
  if (!route.data) return <Screen><ErrorBox message={route.error} onRetry={() => void route.reload()} /></Screen>;
  const r = route.data;
  const intercity = r.serviceType === "intercity";
  // Numa rota intercidades não se embarca na última paragem (chegada).
  const pickups = r.stops.filter((s, i) => s.kind === "pickup" && !(intercity && i === r.stops.length - 1));
  const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));

  return (
    <Screen>
      <Stack.Screen options={{ title: r.code }} />
      <Card>
        <Row>
          <Title>{r.name}</Title>
          <DemoTag show={r.isDemo} />
        </Row>
        <Body muted>
          {intercity
            ? `${LABELS.serviceType.intercity} · reserva obrigatória, dentro do limite do seu plano`
            : `${LABELS.direction[r.direction]} · ${r.universities.map((u) => u.shortName).join(", ")}`}
        </Body>
        {r.description ? <Body>{r.description}</Body> : null}
      </Card>

      <Card>
        <Subtitle>Paragens</Subtitle>
        {r.stops.map((s) => (
          <Row key={s.routeStopId} style={{ justifyContent: "space-between" }}>
            <Body style={{ flex: 1 }}>
              {s.position}. {s.name}
              {s.kind === "destination" ? " (universidade)" : ""}
            </Body>
            <Body muted>+{s.minutesFromStart} min</Body>
          </Row>
        ))}
        <Body muted>Horários: {r.schedules.map((s) => `${s.departureTime} (${formatDays(s.daysOfWeek)})`).join(" · ") || "sem horários activos"}</Body>
      </Card>

      <Card>
        <Subtitle>Reservar lugar</Subtitle>
        <Body muted>1. Dia</Body>
        <Row>
          {dates.map((d) => (
            <Chip key={d} label={d === today ? "Hoje" : formatDate(d)} selected={date === d} onPress={() => { setDate(d); setTripId(null); setBooked(null); }} />
          ))}
        </Row>

        <Body muted>2. Viagem</Body>
        {trips.loading && !trips.data ? <Loading /> : null}
        <ErrorBox message={trips.error} onRetry={() => void trips.reload()} />
        {trips.data?.length === 0 ? <Empty>Sem viagens marcadas para este dia.</Empty> : null}
        {trips.data?.map((t) => {
          const selected = tripId === t.id;
          const full = t.seatsAvailable === 0;
          return (
            <Pressable
              key={t.id}
              disabled={full || t.status !== "scheduled"}
              onPress={() => { setTripId(t.id); setBooked(null); }}
              style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: selected ? c.primary : c.border, backgroundColor: selected ? c.primaryLight : c.surface }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Body>Partida às {t.departureTime}</Body>
                {t.status === "in_progress" ? (
                  <Badge label="Em circulação" tone="info" />
                ) : full ? (
                  <Badge label="Lotada" tone="danger" />
                ) : (
                  <Badge label={`${t.seatsAvailable} de ${t.capacity} lugares`} tone="success" />
                )}
              </Row>
            </Pressable>
          );
        })}

        <Body muted>3. Paragem de embarque</Body>
        <Row>
          {pickups.map((s) => (
            <Chip key={s.stopId} label={s.name} selected={stopId === s.stopId} onPress={() => setStopId(s.stopId)} />
          ))}
        </Row>
        {stopId && tripId ? (
          <Body muted>
            Hora prevista na paragem:{" "}
            {addMinutesToTime(trips.data?.find((t) => t.id === tripId)?.departureTime ?? "00:00", pickups.find((s) => s.stopId === stopId)?.minutesFromStart ?? 0)}{" "}
            (segundo o horário)
          </Body>
        ) : null}

        <ErrorBox message={bookError} />
        {booked ? (
          <View style={{ gap: 8 }}>
            <Notice tone="success">Reserva confirmada. Lugar {booked.seatNumber}.</Notice>
            <Button label="Ver as minhas reservas" variant="secondary" onPress={() => router.push("/student/bookings")} />
          </View>
        ) : (
          <Button label="Confirmar reserva" onPress={() => void book()} busy={busy} disabled={!tripId || !stopId} />
        )}
        <Body muted>A reserva exige inscrição universitária confirmada e um plano activo. A disponibilidade é confirmada pelo servidor no momento da reserva.</Body>
      </Card>
    </Screen>
  );
}
