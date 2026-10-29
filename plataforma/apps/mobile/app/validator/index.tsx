import { router } from "expo-router";
import { Pressable } from "react-native";
import { api } from "../../src/api.ts";
import { useAuth } from "../../src/auth.tsx";
import type { ValidatorTrip } from "../../src/types.ts";
import { Body, Button, Card, Empty, ErrorBox, Loading, Notice, Screen, Subtitle, useLoad, useRefreshOnFocus } from "../../src/ui.tsx";

/** Validador de uma transportadora parceira: só vê as viagens em curso feitas com veículos da sua transportadora. */
export default function ValidatorTrips() {
  const { me, logout } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<ValidatorTrip[]>("/validator/trips"));
  useRefreshOnFocus(reload);

  return (
    <Screen onRefresh={() => void reload()} refreshing={loading}>
      <Body muted>Sessão de {me?.fullName}</Body>
      <Notice tone="info">Só aparecem as viagens já iniciadas pelo motorista, em veículos da sua transportadora.</Notice>
      <ErrorBox message={error} onRetry={() => void reload()} />
      {loading && !data ? <Loading /> : null}
      {data?.length === 0 ? <Empty>Não há viagens em curso na sua área de validação.</Empty> : null}
      {data && data.length > 0 ? (
        <Card>
          <Subtitle>Escolha a viagem</Subtitle>
          {data.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/validator/scan/${t.id}`)} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: "#eee", gap: 4 }}>
              <Body>
                {t.departureTime} · {t.routeCode}
              </Body>
              <Body muted>
                {t.routeName} · {t.vehiclePlate}
              </Body>
            </Pressable>
          ))}
        </Card>
      ) : null}
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
