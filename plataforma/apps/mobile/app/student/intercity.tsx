import { LABELS } from "@uni/shared";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../src/api.ts";
import { addMinutesToTime, formatDuration, relativeDay } from "../../src/format.ts";
import { Hero, HeroText, HeroTitle, IconButton, Page, Panel, Pill, seatsPill, TimeBar } from "../../src/kit.tsx";
import type { MySubscription, RouteSummary } from "../../src/types.ts";
import { Body, Button, c, DemoTag, Empty, ErrorBox, Field, Loading, Notice, useLoad } from "../../src/ui.tsx";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt");

export default function IntercityScreen() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [applied, setApplied] = useState({ origin: "", destination: "" });
  const data = useLoad(async () => {
    const [routes, subs] = await Promise.all([api<RouteSummary[]>("/routes?serviceType=intercity"), api<MySubscription[]>("/subscriptions/me")]);
    return { routes, subs };
  });

  const results = useMemo(() => {
    const o = fold(applied.origin.trim());
    const d = fold(applied.destination.trim());
    return (data.data?.routes ?? []).filter((r) => {
      const name = fold(`${r.name} ${r.description ?? ""}`);
      const oi = o ? name.indexOf(o) : 0;
      const di = d ? name.indexOf(d) : name.length;
      return oi >= 0 && di >= 0 && (!o || !d || oi < di);
    });
  }, [data.data, applied]);

  const active = data.data?.subs.find((s) => s.status === "active") ?? null;
  const coverage = active ? LABELS.intercityModel[active.intercityModel] : null;

  const hero = (
    <Hero paddingBottom={90}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <IconButton icon="back" label="Voltar" onPress={() => (router.canGoBack() ? router.back() : router.replace("/student"))} />
        <HeroTitle>Intercidades</HeroTitle>
      </View>
      <HeroText>Viagens entre cidades com reserva, dentro do que o seu plano inclui.</HeroText>
    </Hero>
  );

  return (
    <Page hero={hero} overlap={64} onRefresh={() => void data.reload()} refreshing={data.loading}>
      <Panel style={{ gap: 12 }}>
        <Field label="Origem" value={origin} onChangeText={setOrigin} placeholder="Ex.: Luanda" />
        <Field label="Destino" value={destination} onChangeText={setDestination} placeholder="Ex.: Benguela" onSubmitEditing={() => setApplied({ origin, destination })} />
        <Button label="Pesquisar" onPress={() => setApplied({ origin, destination })} />
        <Body muted style={{ fontSize: 13 }}>Escolha o dia e a partida no ecrã da rota.</Body>
      </Panel>

      <ErrorBox message={data.error} onRetry={() => void data.reload()} />
      {data.loading && !data.data ? <Loading /> : null}
      {data.data ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
          <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>
            {results.length} {results.length === 1 ? "rota encontrada" : "rotas encontradas"}
          </Text>
          {coverage ? <Text style={{ color: c.textMuted, fontSize: 13 }}>O seu plano: {coverage}</Text> : null}
        </View>
      ) : null}
      {data.data && results.length === 0 ? <Empty>Não há rotas intercidades activas para esta pesquisa.</Empty> : null}
      {results.map((r) => {
        const first = r.departures[0];
        const seats = seatsPill(r.nextTrip?.seatsAvailable);
        return (
          <Panel key={r.id} onPress={() => router.push(`/student/route/${r.id}`)} style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ flex: 1, color: c.textMuted, fontSize: 15 }}>
                Rota {r.code} · {r.stopCount} paragens
              </Text>
              <DemoTag show={r.isDemo} />
              <Pill label={seats.label} tone={seats.tone} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: "700", color: c.text }}>{r.name}</Text>
            {first ? <TimeBar from={first} to={addMinutesToTime(first, r.durationMinutes)} middle={formatDuration(r.durationMinutes)} /> : <Body muted>Sem horário activo.</Body>}
            {r.nextTrip ? (
              <Body muted>
                Próxima partida: {relativeDay(r.nextTrip.serviceDate)}, {r.nextTrip.departureTime}
              </Body>
            ) : null}
          </Panel>
        );
      })}
      <Notice>O passe não dá acesso ilimitado às intercidades. Cada viagem exige reserva e conta para o limite do seu plano.</Notice>
    </Page>
  );
}
