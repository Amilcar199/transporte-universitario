import { LABELS } from "@uni/shared";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { api } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { relativeDay } from "../../src/format.ts";
import { Avatar, Hero, HeroText, Page, Panel, Pill, SectionTitle } from "../../src/kit.tsx";
import type { DriverTrip } from "../../src/types.ts";
import { Body, Button, c, Empty, ErrorBox, Loading, useLoad, useRefreshOnFocus } from "../../src/ui.tsx";

const TONE = { scheduled: "neutral", in_progress: "accent", completed: "success", cancelled: "danger" } as const;

export default function DriverTrips() {
  const { me, logout } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<DriverTrip[]>("/driver/trips"));
  useRefreshOnFocus(reload);
  const byDate = new Map<string, DriverTrip[]>();
  for (const t of data ?? []) byDate.set(t.serviceDate, [...(byDate.get(t.serviceDate) ?? []), t]);
  const current = data?.find((t) => t.status === "in_progress");

  const hero = (
    <Hero paddingBottom={32}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={me?.fullName} />
        <View style={{ flex: 1 }}>
          <HeroText>Motorista</HeroText>
          <HeroText strong>{me?.fullName}</HeroText>
        </View>
      </View>
      <HeroText>{current ? `Viagem em curso: ${current.routeCode} às ${current.departureTime}.` : "As viagens atribuídas de ontem aos próximos 7 dias."}</HeroText>
    </Hero>
  );

  return (
    <Page hero={hero} onRefresh={() => void reload()} refreshing={loading}>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty>Não tem viagens atribuídas entre ontem e os próximos 7 dias.</Empty> : null}
      {[...byDate.entries()].map(([date, trips]) => (
        <View key={date} style={{ gap: 12 }}>
          <SectionTitle title={relativeDay(date)} />
          {trips.map((t) => (
            <Panel key={t.id} highlighted={t.status === "in_progress"} onPress={() => router.push(`/driver/trip/${t.id}`)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ fontSize: 22, fontWeight: "800", color: c.primary }}>{t.departureTime}</Text>
                <Text style={{ flex: 1, color: c.textMuted, fontSize: 15 }}>Rota {t.routeCode}</Text>
                <Pill label={LABELS.tripStatus[t.status]} tone={TONE[t.status]} />
              </View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>{t.routeName}</Text>
              <Body muted>
                {t.vehiclePlate}
                {t.vehicleModel ? ` · ${t.vehicleModel}` : ""} · {t.capacity} lugares
              </Body>
            </Panel>
          ))}
        </View>
      ))}
      <Button label="Comunicar ocorrência" variant="outline" onPress={() => router.push("/driver/incident")} />
      <Button
        label="Terminar sessão"
        variant="dangerOutline"
        onPress={async () => {
          await logout();
          router.replace("/login");
        }}
      />
    </Page>
  );
}
