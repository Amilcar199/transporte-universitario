import { router } from "expo-router";
import { Text, View } from "react-native";
import { api } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import { Avatar, Hero, HeroText, Icon, Page, Panel, Pill } from "../../src/kit.tsx";
import type { ValidatorTrip } from "../../src/types.ts";
import { Body, Button, c, Empty, ErrorBox, Loading, useLoad, useRefreshOnFocus } from "../../src/ui.tsx";

/** Validador de uma transportadora parceira: só vê as viagens em curso feitas com veículos da sua transportadora. */
export default function ValidatorTrips() {
  const { me, logout } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<ValidatorTrip[]>("/validator/trips"));
  useRefreshOnFocus(reload);

  const hero = (
    <Hero paddingBottom={32}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={me?.fullName} />
        <View style={{ flex: 1 }}>
          <HeroText>Validador</HeroText>
          <HeroText strong>{me?.fullName}</HeroText>
        </View>
      </View>
      <HeroText>Só aparecem as viagens já iniciadas pelo motorista, em veículos da sua transportadora.</HeroText>
    </Hero>
  );

  return (
    <Page hero={hero} onRefresh={() => void reload()} refreshing={loading}>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty>Não há viagens em curso na sua área de validação.</Empty> : null}
      {data?.map((t) => (
        <Panel key={t.id} onPress={() => router.push({ pathname: "/validator/scan/[tripId]", params: { tripId: t.id, route: t.routeCode } })} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: c.primary }}>{t.departureTime}</Text>
            <Text style={{ flex: 1, color: c.textMuted, fontSize: 15 }}>Rota {t.routeCode}</Text>
            <Pill label="Em curso" tone="accent" />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>{t.routeName}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Body muted style={{ flex: 1 }}>{t.vehiclePlate}</Body>
            <Icon name="scan" color={c.primary} size={20} />
            <Text style={{ color: c.primary, fontWeight: "700" }}>Validar passes</Text>
          </View>
        </Panel>
      ))}
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
