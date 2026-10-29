import { LABELS } from "@uni/shared";
import { router } from "expo-router";
import { Pressable } from "react-native";
import { api } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { formatDate, luandaToday } from "../../src/format.ts";
import type { DriverTrip } from "../../src/types.ts";
import { Badge, Body, Button, Card, Empty, ErrorBox, Loading, Row, Screen, Subtitle, useLoad, useRefreshOnFocus, type Tone } from "../../src/ui.tsx";

const TONE: Record<string, Tone> = { scheduled: "neutral", in_progress: "info", completed: "success", cancelled: "danger" };

export default function DriverTrips() {
  const { me, logout } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<DriverTrip[]>("/driver/trips"));
  useRefreshOnFocus(reload);
  const today = luandaToday();
  const byDate = new Map<string, DriverTrip[]>();
  for (const t of data ?? []) byDate.set(t.serviceDate, [...(byDate.get(t.serviceDate) ?? []), t]);

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <Body muted>Sessão de {me?.fullName}</Body>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty>Não tem viagens atribuídas entre ontem e os próximos 7 dias.</Empty> : null}
      {[...byDate.entries()].map(([date, trips]) => (
        <Card key={date}>
          <Subtitle>{date === today ? "Hoje" : formatDate(date)}</Subtitle>
          {trips.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/driver/trip/${t.id}`)} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: "#eee", gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Body>
                  {t.departureTime} · {t.routeCode}
                </Body>
                <Badge label={LABELS.tripStatus[t.status]} tone={TONE[t.status]} />
              </Row>
              <Body muted>
                {t.routeName} · {t.vehiclePlate} ({t.capacity} lugares)
              </Body>
            </Pressable>
          ))}
        </Card>
      ))}
      <Button label="Comunicar ocorrência" variant="secondary" onPress={() => router.push("/driver/incident")} />
      <Button
        label="Terminar sessão"
        variant="danger"
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      />
    </Screen>
  );
}
