import { LABELS } from "@uni/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { addMinutesToTime, formatDate, formatDateTime, luandaTime, luandaToday } from "../../../src/format.ts";
import { Hero, Icon, IconButton, ListRow, Page, Panel, Pill, SectionTitle } from "../../../src/kit.tsx";
import type { DriverTripDetail, ManifestEntry } from "../../../src/types.ts";
import { useTripLocation, type LocationState } from "../../../src/use-trip-location.ts";
import { Body, Button, c, Empty, ErrorBox, errorMessage, Loading, Notice, useLoad } from "../../../src/ui.tsx";

const BOOKING_TONE = { confirmed: "warning", boarded: "success", no_show: "danger", cancelled: "neutral" } as const;
const TRIP_TONE = { scheduled: "neutral", in_progress: "accent", completed: "success", cancelled: "danger" } as const;

function locationInfo(state: LocationState): { color: string; title: string; detail: string } | null {
  switch (state.kind) {
    case "off":
      return null;
    case "requesting":
      return { color: c.warning, title: "A pedir autorização de localização", detail: "Aceite o pedido do telemóvel." };
    case "denied":
      return { color: c.danger, title: "Localização não autorizada", detail: "Os estudantes não conseguem acompanhar o autocarro. Autorize nas definições do telemóvel." };
    case "error":
      return { color: c.danger, title: "Localização indisponível", detail: state.message };
    case "sharing":
      return {
        color: c.success,
        title: "Partilha de localização activa",
        detail:
          (state.lastSentAt ? `Último envio: ${formatDateTime(state.lastSentAt.toISOString())}.` : "A aguardar a primeira posição.") +
          (state.pending > 0 ? ` ${state.pending} por enviar.` : "") +
          " Termina quando fechar a viagem ou este ecrã.",
      };
  }
}

export default function DriverTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
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
  const back = () => (router.canGoBack() ? router.back() : router.replace("/driver"));
  if (!trip.data) {
    return (
      <Page hero={<Hero><IconButton icon="back" label="Voltar" onPress={back} /></Hero>}>
        <ErrorBox message={trip.error} onRetry={() => void trip.reload()} />
      </Page>
    );
  }

  const t = trip.data;
  const stops = t.route.stops;
  const live = t.status === "in_progress";
  const boarded = t.manifest.filter((m) => m.status === "boarded").length;
  const timeAt = (minutes: number) => addMinutesToTime(t.departureTime, minutes);
  const atStop = (stopId: string) => t.manifest.filter((m) => m.stopId === stopId && (m.status === "confirmed" || m.status === "boarded"));
  const lastStop = stops[stops.length - 1];

  // Sem posição por paragem, a próxima paragem é a primeira cuja hora prevista ainda não passou.
  let nextIndex = -1;
  if (t.status === "scheduled") nextIndex = 0;
  else if (live) {
    const now = t.serviceDate === luandaToday() ? luandaTime() : t.serviceDate < luandaToday() ? "99:99" : "00:00";
    nextIndex = stops.findIndex((s) => timeAt(s.minutesFromStart) >= now);
    if (nextIndex < 0) nextIndex = stops.length - 1;
  }
  const next = nextIndex >= 0 ? stops[nextIndex] : undefined;
  const later = nextIndex >= 0 ? stops.slice(nextIndex + 1) : [];
  const nextPassengers = next ? atStop(next.stopId) : [];
  const toBoard = nextPassengers.filter((m) => m.status === "confirmed");
  const info = locationInfo(location);

  const hero = (
    <Hero paddingBottom={28}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <IconButton icon="back" label="Voltar" onPress={back} />
        <Text style={{ flex: 1, color: "rgba(255,255,255,0.85)", fontSize: 15 }} numberOfLines={1}>
          Olá, {me?.fullName.split(" ")[0]} · {t.vehicle?.plate ?? "sem veículo"}
        </Text>
        <Pill label={live ? "Em serviço" : LABELS.tripStatus[t.status]} tone={TRIP_TONE[t.status]} />
      </View>
      <Text style={{ color: "#fff", fontSize: 26, fontWeight: "800" }}>{t.route.name}</Text>
      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 15 }}>
        Rota {t.route.code} · {formatDate(t.serviceDate)}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Stat label="Passageiros" value={`${boarded} / ${t.capacity}`} />
        <Stat label="Partida" value={t.departureTime} />
        <Stat label="Chegada" value={lastStop ? timeAt(lastStop.minutesFromStart) : "—"} />
      </View>
    </Hero>
  );

  const bottom =
    t.status === "scheduled" ? (
      <Button label="Iniciar viagem" flex busy={busy === "start"} onPress={() => void run("start", () => api(`/driver/trips/${t.id}/start`, { method: "POST" }))} />
    ) : live && confirmFinish ? (
      <>
        <Button label="Continuar" variant="outline" flex onPress={() => setConfirmFinish(false)} />
        <Button
          label="Terminar"
          variant="danger"
          flex
          busy={busy === "finish"}
          onPress={() =>
            void run("finish", async () => {
              const res = await api<{ noShows: number }>(`/driver/trips/${t.id}/finish`, { method: "POST" });
              setFinishInfo(`Viagem terminada. ${res.noShows} reserva(s) sem embarque.`);
              setConfirmFinish(false);
            })
          }
        />
      </>
    ) : live ? (
      <>
        <Button
          label="Validar passe"
          variant="accent"
          flex
          icon={<Icon name="scan" color={c.primaryDark} />}
          onPress={() => router.push({ pathname: "/driver/scan/[tripId]", params: { tripId: t.id, route: `${t.route.code} · ${t.route.direction === "to_university" ? "ida" : "volta"}` } })}
        />
        <Button label="Terminar viagem" flex onPress={() => setConfirmFinish(true)} />
      </>
    ) : null;

  return (
    <Page hero={hero} bottom={bottom} onRefresh={() => void trip.reload()} refreshing={trip.loading}>
      <ErrorBox message={error} />
      {finishInfo ? <Notice tone="success">{finishInfo}</Notice> : null}
      {confirmFinish ? <Notice tone="warning">Terminar a viagem? As reservas sem embarque ficam registadas como «não compareceu».</Notice> : null}

      {info ? (
        <Panel style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: info.color }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{info.title}</Text>
            <Text style={{ fontSize: 14, color: c.textMuted }}>{info.detail}</Text>
          </View>
        </Panel>
      ) : null}

      {next ? (
        <>
          <SectionTitle title={t.status === "scheduled" ? "Primeira paragem" : "Próxima paragem"} />
          <Panel highlighted>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 19, fontWeight: "700", color: c.text }}>{next.name}</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: c.primary }}>{timeAt(next.minutesFromStart)}</Text>
            </View>
            <Body muted>
              {toBoard.length} a embarcar · {nextPassengers.length - toBoard.length} já embarcados
            </Body>
            {live
              ? toBoard.map((m) => (
                  <PassengerRow key={m.bookingId} m={m} busy={busy === m.bookingId} onBoard={() => void run(m.bookingId, () => api(`/driver/trips/${t.id}/bookings/${m.bookingId}/board`, { method: "POST" }))} />
                ))
              : null}
            {live && toBoard.length > 0 ? <Body muted style={{ fontSize: 13 }}>Prefira «Validar passe»; use «Embarcou» quando o estudante não conseguir mostrar o código.</Body> : null}
            {t.serviceDate === luandaToday() && live ? <Body muted style={{ fontSize: 13 }}>Escolhida pela hora prevista, não pela posição do autocarro.</Body> : null}
          </Panel>
        </>
      ) : null}

      {later.length > 0 ? (
        <Panel style={{ paddingVertical: 4 }}>
          {later.map((s, i) => {
            const n = atStop(s.stopId).length;
            return (
              <ListRow
                key={s.routeStopId}
                title={s.name}
                subtitle={n === 0 ? "Sem reservas" : n === 1 ? "1 reserva" : `${n} reservas`}
                right={<Text style={{ color: c.textMuted, fontSize: 15 }}>{timeAt(s.minutesFromStart)}</Text>}
                last={i === later.length - 1}
              />
            );
          })}
        </Panel>
      ) : null}

      {t.status !== "cancelled" ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Comunicar atraso" variant="outline" flex onPress={() => router.push({ pathname: "/driver/incident", params: { kind: "delay", tripId: t.id } })} />
          <Button label="Comunicar avaria" variant="outline" flex onPress={() => router.push({ pathname: "/driver/incident", params: { kind: "breakdown", tripId: t.id } })} />
        </View>
      ) : null}

      <SectionTitle title={`Passageiros (${t.manifest.length})`} />
      <Panel style={{ paddingVertical: 4 }}>
        {t.manifest.length === 0 ? <Empty>Sem reservas nesta viagem.</Empty> : null}
        {t.manifest.map((m, i) => (
          <ListRow
            key={m.bookingId}
            title={`${m.seatNumber}. ${m.studentName}`}
            subtitle={m.stopName}
            right={<Pill label={LABELS.bookingStatus[m.status]} tone={BOOKING_TONE[m.status]} />}
            last={i === t.manifest.length - 1}
          />
        ))}
      </Panel>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(255,255,255,0.14)", borderRadius: 16, padding: 14, gap: 4 }}>
      <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>{label}</Text>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800" }}>{value}</Text>
    </View>
  );
}

function PassengerRow({ m, busy, onBoard }: { m: ManifestEntry; busy: boolean; onBoard: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: "#EDF0F5", paddingTop: 10 }}>
      <Text style={{ flex: 1, fontSize: 15, color: c.text }}>
        {m.seatNumber}. {m.studentName}
      </Text>
      <Button label="Embarcou" variant="secondary" busy={busy} onPress={onBoard} />
    </View>
  );
}
