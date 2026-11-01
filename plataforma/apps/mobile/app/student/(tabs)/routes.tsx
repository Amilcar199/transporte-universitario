import { LABELS, type RouteDirection } from "@uni/shared";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { addMinutesToTime, formatDays, relativeDay } from "../../../src/format.ts";
import { Chips, Hero, HeroChip, HeroTitle, Icon, Page, Panel, Pill, seatsPill, TimeBar } from "../../../src/kit.tsx";
import type { RouteSummary, University } from "../../../src/types.ts";
import { Body, c, DemoTag, Empty, ErrorBox, Loading, useLoad } from "../../../src/ui.tsx";

export default function RoutesTab() {
  const { me } = useAuth();
  const params = useLocalSearchParams<{ stopId?: string; stopName?: string }>();
  const verifiedUni = me?.student?.verificationStatus === "approved" ? me.student.universityId : null;
  const [universityId, setUniversityId] = useState<string | null>(verifiedUni);
  const [direction, setDirection] = useState<RouteDirection | null>(null);
  const [query, setQuery] = useState("");
  const [stop, setStop] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (params.stopId) setStop({ id: params.stopId, name: params.stopName ?? "Paragem escolhida" });
  }, [params.stopId, params.stopName]);

  const universities = useLoad(() => api<University[]>("/universities"));
  const routes = useLoad(() => {
    const q = new URLSearchParams({ serviceType: "university" });
    if (universityId) q.set("universityId", universityId);
    if (stop) q.set("stopId", stop.id);
    return api<RouteSummary[]>(`/routes?${q}`);
  }, [universityId, stop?.id]);

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase("pt");
    return (routes.data ?? [])
      .filter((r) => !direction || r.direction === direction)
      .filter((r) => !text || `${r.name} ${r.code} ${r.description ?? ""} ${r.universities.join(" ")}`.toLocaleLowerCase("pt").includes(text))
      .sort((a, b) => (a.departures[0] ?? "99").localeCompare(b.departures[0] ?? "99"));
  }, [routes.data, direction, query]);

  const hero = (
    <Hero paddingBottom={24}>
      <HeroTitle>Rotas universitárias</HeroTitle>
      <View style={s.search}>
        <Icon name="search" color={c.textMuted} />
        <TextInput
          aria-label="Pesquisar rotas"
          value={query}
          onChangeText={setQuery}
          placeholder="Bairro, rota ou universidade"
          placeholderTextColor={c.textMuted}
          style={s.searchInput}
        />
      </View>
      <Chips>
        {universities.data?.map((u) => (
          <HeroChip key={u.id} label={u.shortName} selected={universityId === u.id} onPress={() => setUniversityId(universityId === u.id ? null : u.id)} />
        ))}
        <HeroChip label="Ida" selected={direction === "to_university"} onPress={() => setDirection(direction === "to_university" ? null : "to_university")} />
        <HeroChip label="Volta" selected={direction === "from_university"} onPress={() => setDirection(direction === "from_university" ? null : "from_university")} />
      </Chips>
    </Hero>
  );

  return (
    <Page hero={hero} onRefresh={() => void routes.reload()} refreshing={routes.loading}>
      {stop ? (
        <View style={s.stopFilter}>
          <Icon name="pin" color={c.primary} size={18} />
          <Text style={{ flex: 1, color: c.text, fontWeight: "600" }} numberOfLines={1}>
            Passam em {stop.name}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setStop(null)} hitSlop={8}>
            <Text style={{ color: c.primary, fontWeight: "700" }}>Limpar</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: c.text }}>
          {routes.data ? `${visible.length} ${visible.length === 1 ? "rota" : "rotas"} para si` : "Rotas"}
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 14 }}>Ordenar: horário</Text>
      </View>
      <ErrorBox message={routes.error} onRetry={() => void routes.reload()} />
      {routes.loading && !routes.data ? <Loading /> : null}
      {routes.data && visible.length === 0 ? <Empty>Não há rotas activas para estes filtros.</Empty> : null}
      {visible.map((r) => {
        const seats = seatsPill(r.nextTrip?.seatsAvailable);
        const first = r.departures[0];
        return (
          <Panel key={r.id} onPress={() => router.push(`/student/route/${r.id}`)} style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.name}>{r.name}</Text>
                <Body muted>
                  Rota {r.code} · {r.stopCount} paragens
                </Body>
              </View>
              <Pill label={seats.label} tone={seats.tone} />
            </View>
            {first ? <TimeBar from={first} to={addMinutesToTime(first, r.durationMinutes)} /> : <Body muted>Sem horário activo.</Body>}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <Body muted>
                  {r.daysOfWeek.length ? formatDays(r.daysOfWeek) : "Sem dias"} · {r.direction === "to_university" ? "Ida" : "Volta"}
                  {r.departures.length > 1 ? ` · ${r.departures.length} partidas` : ""}
                </Body>
                <DemoTag show={r.isDemo} />
              </View>
              {r.nextTrip ? (
                <Text style={s.next}>
                  {relativeDay(r.nextTrip.serviceDate)}, {r.nextTrip.departureTime}
                </Text>
              ) : null}
            </View>
          </Panel>
        );
      })}
      {routes.data && visible.length > 0 ? (
        <Body muted style={{ textAlign: "center", fontSize: 13 }}>
          Lugares livres da próxima viagem marcada · {LABELS.serviceType.university}
        </Body>
      ) : null}
    </Page>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 18, paddingHorizontal: 18, minHeight: 58 },
  searchInput: { flex: 1, fontSize: 16, color: c.text, minHeight: 56, outlineWidth: 0 },
  stopFilter: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.primaryLight, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  name: { fontSize: 18, fontWeight: "700", color: c.text },
  next: { fontSize: 15, fontWeight: "800", color: c.text },
});
