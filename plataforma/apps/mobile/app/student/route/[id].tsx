import { LABELS } from "@uni/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api.ts";
import { addDays, addMinutesToTime, formatDate, formatDays, luandaToday } from "../../../src/format.ts";
import { Chips, Hero, HeroChip, IconButton, Page, Panel, Pill, seatsPill, StopTimeline } from "../../../src/kit.tsx";
import type { MySubscription, RouteDetail, TripAvailability } from "../../../src/types.ts";
import { Body, Button, c, Chip, DemoTag, Empty, ErrorBox, Loading, Notice, errorMessage, useLoad } from "../../../src/ui.tsx";

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
  const subs = useLoad(() => api<MySubscription[]>("/subscriptions/me"));

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
  if (!route.data) {
    return (
      <Page>
        <ErrorBox message={route.error} onRetry={() => void route.reload()} />
      </Page>
    );
  }
  const r = route.data;
  const intercity = r.serviceType === "intercity";
  const lastIndex = r.stops.length - 1;
  // Numa rota intercidades não se embarca na última paragem (chegada).
  const canBoard = (i: number) => r.stops[i]!.kind === "pickup" && !(intercity && i === lastIndex);
  const dates = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));
  const trip = trips.data?.find((t) => t.id === tripId) ?? null;
  const baseTime = trip?.departureTime ?? r.schedules[0]?.departureTime ?? null;
  const duration = r.stops[lastIndex]?.minutesFromStart ?? 0;
  const days = [...new Set(r.schedules.flatMap((s) => s.daysOfWeek))];
  const stop = r.stops.find((s) => s.stopId === stopId) ?? null;
  const active = subs.data?.find((s) => s.status === "active") ?? null;

  const hero = (
    <Hero paddingBottom={30}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconButton icon="back" label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace("/student/routes"))} />
        <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 17 }}>Rota {r.code}</Text>
        <DemoTag show={r.isDemo} />
      </View>
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "800" }}>{r.name}</Text>
      <Chips>
        {days.length ? <HeroChip label={formatDays(days)} /> : null}
        {baseTime ? <HeroChip label={`${baseTime} – ${addMinutesToTime(baseTime, duration)}`} /> : null}
        {trip ? <HeroChip label={trip.seatsAvailable === 0 ? "Lotada" : `${trip.seatsAvailable} lugares livres`} selected /> : null}
        {intercity ? <HeroChip label={LABELS.serviceType.intercity} /> : null}
      </Chips>
    </Hero>
  );

  const bottom = booked ? (
    <Button label="Ver as minhas reservas" onPress={() => router.push("/student/bookings")} flex />
  ) : subs.data && !active ? (
    <Button label="Escolher plano para reservar" onPress={() => router.push("/student/plans")} flex />
  ) : (
    <Button label="Confirmar reserva" onPress={() => void book()} busy={busy} disabled={!tripId || !stopId} flex />
  );

  return (
    <Page hero={hero} bottom={bottom}>
      <Panel style={{ gap: 6, marginTop: 4 }}>
        <Text style={s.panelTitle}>Paragens da rota</Text>
        <Body muted style={{ fontSize: 13 }}>
          {intercity ? "Toque na paragem onde vai embarcar." : "Toque na paragem onde vai entrar."} Horas previstas segundo o horário.
        </Body>
        <StopTimeline
          stops={r.stops.map((st, i) => ({
            key: st.routeStopId,
            name: st.kind === "destination" ? `${st.name} (universidade)` : st.name,
            time: baseTime ? addMinutesToTime(baseTime, st.minutesFromStart) : `+${st.minutesFromStart} min`,
            strong: i === 0 || i === lastIndex,
            selected: st.stopId === stopId,
            onPress: canBoard(i) && !booked ? () => setStopId(st.stopId) : undefined,
          }))}
        />
        {r.description ? <Body muted>{r.description}</Body> : null}
      </Panel>

      <Panel style={{ gap: 12 }}>
        <Text style={s.panelTitle}>Reservar lugar</Text>
        <Text style={s.label}>Dia</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dates.map((d) => (
            <Chip
              key={d}
              label={d === today ? "Hoje" : formatDate(d)}
              selected={date === d}
              onPress={() => {
                setDate(d);
                setTripId(null);
                setBooked(null);
              }}
            />
          ))}
        </ScrollView>

        <Text style={s.label}>Partida</Text>
        {trips.loading && !trips.data ? <Loading /> : null}
        <ErrorBox message={trips.error} onRetry={() => void trips.reload()} />
        {trips.data?.length === 0 ? <Empty>Sem viagens marcadas para este dia.</Empty> : null}
        {trips.data?.map((t) => {
          const selected = tripId === t.id;
          const p = seatsPill(t.seatsAvailable);
          return (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={t.seatsAvailable === 0 || t.status !== "scheduled" || !!booked}
              onPress={() => {
                setTripId(t.id);
                setBooked(null);
              }}
              style={[s.trip, selected && s.tripSelected]}
            >
              <Text style={[s.tripText, selected && { color: c.primary }]}>Partida às {t.departureTime}</Text>
              {t.status === "in_progress" ? <Pill label="Em circulação" tone="info" /> : <Pill label={p.label} tone={p.tone} />}
            </Pressable>
          );
        })}

        <View style={s.summary}>
          <SummaryRow label="Paragem de embarque" value={stop?.name ?? "Escolha na lista acima"} muted={!stop} />
          <SummaryRow label="Dia" value={date === today ? "Hoje" : formatDate(date)} />
          <SummaryRow
            label="Hora prevista na paragem"
            value={trip && stop ? addMinutesToTime(trip.departureTime, stop.minutesFromStart) : "—"}
            muted={!trip || !stop}
          />
          <SummaryRow label="Cobertura" value={active ? active.planName : subs.data ? "Sem plano activo" : "—"} muted={!active} />
        </View>

        <ErrorBox message={bookError} />
        {booked ? <Notice tone="success">Reserva confirmada. Lugar {booked.seatNumber}.</Notice> : null}
        <Body muted style={{ fontSize: 13, lineHeight: 18 }}>
          A reserva exige inscrição universitária confirmada e um plano activo. A disponibilidade é confirmada pelo servidor no momento da reserva.
        </Body>
      </Panel>
    </Page>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={s.summaryRow}>
      <Text style={{ color: c.textMuted, fontSize: 15, flexShrink: 0 }}>{label}</Text>
      <Text style={{ color: muted ? c.textMuted : c.text, fontSize: 15, fontWeight: muted ? "400" : "700", flex: 1, textAlign: "right" }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  panelTitle: { fontSize: 17, fontWeight: "700", color: c.text },
  label: { fontSize: 14, fontWeight: "600", color: c.textMuted },
  trip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E1E6EE",
    backgroundColor: c.surface,
  },
  tripSelected: { borderColor: c.primary, backgroundColor: c.primaryLight },
  tripText: { fontSize: 16, fontWeight: "600", color: c.text },
  summary: { borderTopWidth: 1, borderTopColor: "#EDF0F5", paddingTop: 8 },
  summaryRow: { flexDirection: "row", gap: 12, paddingVertical: 7, alignItems: "center" },
});
