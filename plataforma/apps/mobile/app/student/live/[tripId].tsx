import { LABELS } from "@uni/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../src/api.ts";
import { formatDate, formatDateTime, formatDistance } from "../../../src/format.ts";
import { Icon, IconButton, Pill, ProgressBar } from "../../../src/kit.tsx";
import { RouteSketch, shortLabel } from "../../../src/route-sketch.tsx";
import type { LiveTrip } from "../../../src/types.ts";
import { Body, Button, c, ErrorBox, Loading, Notice, useLoad } from "../../../src/ui.tsx";

const POLL_MS = 15_000;

/** Índice da paragem mais próxima de um ponto (distância aproximada, só para orientação). */
function nearestStop(stops: LiveTrip["route"]["stops"], p: { lat: number; lng: number }): number {
  let best = 0;
  let bestD = Infinity;
  stops.forEach((s, i) => {
    const d = (s.lat - p.lat) ** 2 + ((s.lng - p.lng) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

export default function LiveTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const insets = useSafeAreaInsets();
  const { data, error, loading, reload } = useLoad(() => api<LiveTrip>(`/trips/${tripId}/live`), [tripId]);

  useEffect(() => {
    if (data?.status === "completed" || data?.status === "cancelled") return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload, data?.status]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/student"));
  if (loading && !data) return <Loading />;
  if (!data) {
    return (
      <View style={{ flex: 1, padding: 20, paddingTop: insets.top + 20, gap: 12, backgroundColor: c.background }}>
        <IconButton icon="back" label="Voltar" onPress={back} light={false} />
        <ErrorBox message={error} onRetry={() => void reload()} />
      </View>
    );
  }

  const loc = data.location;
  const stops = data.route.stops;
  const near = loc && stops.length ? nearestStop(stops, loc) : null;
  const mine = stops.findIndex((s) => s.stopId === data.myStopId);
  const progress = near !== null && stops.length > 1 ? near / (stops.length - 1) : 0;
  const tone = data.status === "in_progress" ? "success" : data.status === "cancelled" ? "danger" : "neutral";

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1 }}>
        <RouteSketch
          stops={stops.map((s) => ({ id: s.stopId, lat: s.lat, lng: s.lng }))}
          endLabel={stops.length ? shortLabel(stops[stops.length - 1]!.name) : undefined}
          highlightId={loc ? null : data.myStopId}
          bus={loc}
          passedIndex={near ?? undefined}
        />
        <View style={[s.top, { top: insets.top + 14 }]}>
          <IconButton icon="back" label="Voltar" onPress={back} light={false} />
          <View style={s.routePill}>
            <Text style={{ fontWeight: "700", color: c.text }} numberOfLines={1}>
              Rota {data.route.code} · {data.route.name}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView style={s.sheet} contentContainerStyle={{ gap: 12, paddingBottom: 20 + insets.bottom }}>
        <View style={s.handle} />
        <View style={s.between}>
          <View>
            <Text style={{ color: c.textMuted, fontSize: 15 }}>{data.myStop ? "Hora prevista na sua paragem" : "Partida"}</Text>
            <Text style={s.big}>{data.myStop?.plannedTime ?? data.departureTime}</Text>
          </View>
          <Pill label={LABELS.tripStatus[data.status]} tone={tone} />
        </View>
        <Body muted>
          {formatDate(data.serviceDate)} · partida às {data.departureTime}
          {data.myStop ? ` · ${data.myStop.name}` : ""}
        </Body>

        {data.status === "scheduled" ? <Notice>A viagem ainda não começou. A posição do autocarro só aparece depois de o motorista iniciar a viagem.</Notice> : null}
        {data.status === "in_progress" && !loc ? <Notice tone="warning">A viagem começou, mas ainda não foi recebida nenhuma posição do autocarro.</Notice> : null}
        {loc ? (
          <View style={s.info}>
            <Icon name="clock" color="#8A5300" />
            <Text style={{ flex: 1, color: "#5C3A00", fontSize: 14, lineHeight: 20 }}>
              {data.myStop?.distanceMeters !== null && data.myStop?.distanceMeters !== undefined
                ? `O autocarro está a ${formatDistance(data.myStop.distanceMeters)} da sua paragem (em linha recta). `
                : ""}
              Última posição às {formatDateTime(loc.recordedAt)}
              {loc.speedMps !== null ? ` · ${Math.round(loc.speedMps * 3.6)} km/h` : ""}.
            </Text>
          </View>
        ) : null}

        {near !== null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={progress} />
            <View style={s.between}>
              <Text style={s.small}>Perto de {stops[near]!.name}</Text>
              {mine >= 0 ? <Text style={s.small}>A sua: {stops[mine]!.name}</Text> : null}
            </View>
          </View>
        ) : null}

        {data.vehicle ? (
          <View style={s.vehicle}>
            <View style={s.vehicleIcon}>
              <Icon name="bus" color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: c.text }}>{data.vehicle.model ?? "Autocarro"}</Text>
              <Body muted>Matrícula {data.vehicle.plate}</Body>
            </View>
          </View>
        ) : null}

        {loc ? (
          <Button
            label="Abrir posição num mapa externo"
            variant="outline"
            onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`)}
          />
        ) : null}
        <Body muted style={{ fontSize: 13, lineHeight: 18 }}>
          {data.note} Actualiza automaticamente a cada 15 segundos.
        </Body>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  top: { position: "absolute", left: 20, right: 20, flexDirection: "row", gap: 10, alignItems: "center" },
  routePill: { flex: 1, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 16, minHeight: 46, justifyContent: "center", boxShadow: "0 6px 20px rgba(19, 43, 99, 0.12)" },
  sheet: {
    flexGrow: 0,
    maxHeight: "58%",
    marginTop: -28,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    boxShadow: "0 -6px 20px rgba(19, 43, 99, 0.08)",
  },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#D3D9E4" },
  between: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  big: { fontSize: 36, fontWeight: "800", color: c.primary },
  info: { flexDirection: "row", gap: 10, backgroundColor: "#FDF1DC", borderRadius: 16, padding: 14 },
  small: { fontSize: 13, color: c.textMuted, flexShrink: 1 },
  vehicle: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#F3F5F9", borderRadius: 18, padding: 14 },
  vehicleIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" },
});
