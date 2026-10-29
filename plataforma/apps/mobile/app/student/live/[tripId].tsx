import { LABELS } from "@uni/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Linking } from "react-native";
import { api } from "../../../src/api.ts";
import { formatDate, formatDateTime, formatDistance } from "../../../src/format.ts";
import type { LiveTrip } from "../../../src/types.ts";
import { Badge, Body, Button, Card, ErrorBox, Loading, Notice, Row, Screen, Subtitle, useLoad } from "../../../src/ui.tsx";

const POLL_MS = 15_000;

export default function LiveTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const { data, error, loading, reload } = useLoad(() => api<LiveTrip>(`/trips/${tripId}/live`), [tripId]);

  useEffect(() => {
    if (data?.status === "completed" || data?.status === "cancelled") return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [reload, data?.status]);

  if (loading && !data) return <Loading />;
  if (!data) return <Screen><ErrorBox message={error} onRetry={() => void reload()} /></Screen>;

  const loc = data.location;
  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <Subtitle>
            {formatDate(data.serviceDate)} · {data.departureTime}
          </Subtitle>
          <Badge label={LABELS.tripStatus[data.status]} tone={data.status === "in_progress" ? "info" : data.status === "cancelled" ? "danger" : "neutral"} />
        </Row>
        {data.myStop ? (
          <>
            <Body>A sua paragem: {data.myStop.name}</Body>
            {data.myStop.plannedTime ? <Body muted>Hora prevista: {data.myStop.plannedTime}</Body> : null}
            {data.myStop.distanceMeters !== null ? <Body>Distância do autocarro à paragem: {formatDistance(data.myStop.distanceMeters)} (em linha recta)</Body> : null}
          </>
        ) : null}
      </Card>

      {data.status === "scheduled" ? <Notice>A viagem ainda não começou. A localização só aparece depois de o motorista iniciar a viagem.</Notice> : null}
      {data.status === "in_progress" && !loc ? <Notice tone="warning">A viagem começou, mas ainda não foi recebida nenhuma localização do autocarro.</Notice> : null}
      {loc ? (
        <Card>
          <Subtitle>Última posição recebida</Subtitle>
          <Body muted>Actualizada às {formatDateTime(loc.recordedAt)}</Body>
          {loc.speedMps !== null ? <Body muted>Velocidade: {Math.round(loc.speedMps * 3.6)} km/h</Body> : null}
          <Button
            label="Abrir posição num mapa externo"
            variant="secondary"
            onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`)}
          />
        </Card>
      ) : null}
      <Body muted>{data.note} Actualiza automaticamente a cada 15 segundos.</Body>
    </Screen>
  );
}
