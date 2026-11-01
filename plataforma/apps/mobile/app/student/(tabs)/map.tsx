import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, ApiError } from "../../../src/api.ts";
import { formatDistance } from "../../../src/format.ts";
import { Icon, ListRow, Pill } from "../../../src/kit.tsx";
import { RouteSketch } from "../../../src/route-sketch.tsx";
import { Body, Button, c, DemoTag, Empty, ErrorBox } from "../../../src/ui.tsx";

interface StopHit {
  id: string;
  name: string;
  neighbourhood: string | null;
  landmark: string | null;
  lat: number;
  lng: number;
  kind: "pickup" | "destination";
  isDemo: boolean;
  distanceMeters?: number;
}

export default function StopsMapTab() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StopHit[] | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(nearMe: boolean) {
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (nearMe) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          setError("Sem autorização de localização. Pesquise a paragem pelo nome ou bairro.");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe(here);
        params.set("lat", String(here.lat));
        params.set("lng", String(here.lng));
      } else {
        setMe(null);
      }
      const found = (await api<StopHit[]>(`/stops/search?${params}`)).filter((h) => h.kind === "pickup").slice(0, 12);
      setHits(found);
      setSelected(found[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível obter a localização.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = hits?.find((h) => h.id === selected) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1 }}>
        <RouteSketch stops={hits ?? []} connect={false} highlightId={selected} me={me} insetTop={insets.top + 140} />
        <View style={[s.overlay, { top: insets.top + 16 }]}>
          <View style={s.search}>
            <Icon name="search" color={c.textMuted} />
            <TextInput
              aria-label="Pesquisar paragem"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => void search(false)}
              placeholder="Pesquisar paragem ou bairro"
              placeholderTextColor={c.textMuted}
              style={s.searchInput}
              returnKeyType="search"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button label="Pesquisar" onPress={() => void search(false)} busy={busy && !me} disabled={busy} flex />
            <Button label="Perto de mim" variant="outline" onPress={() => void search(true)} disabled={busy} flex />
          </View>
        </View>
      </View>

      <View style={s.sheet}>
        <View style={s.handle} />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 19, fontWeight: "700", color: c.text }}>{me ? "Paragens próximas" : "Paragens"}</Text>
          {hits ? <Text style={{ color: c.textMuted }}>{hits.length} encontradas</Text> : null}
        </View>
        <ErrorBox message={error} />
        {!hits && !error ? <Body muted>Use a sua localização ou pesquise pelo nome, bairro ou referência.</Body> : null}
        {hits?.length === 0 ? <Empty>Nenhuma paragem encontrada em rotas activas.</Empty> : null}
        <ScrollView style={{ maxHeight: 220 }}>
          {hits?.map((h, i) => (
            <ListRow
              key={h.id}
              icon="pin"
              selected={h.id === selected}
              title={h.name}
              subtitle={[h.distanceMeters !== undefined ? formatDistance(h.distanceMeters) : null, h.neighbourhood, h.landmark].filter(Boolean).join(" · ") || undefined}
              right={h.isDemo ? <DemoTag show /> : h.id === selected ? <Pill label="Escolhida" tone="info" /> : <View />}
              onPress={() => setSelected(h.id)}
              last={i === hits.length - 1}
            />
          ))}
        </ScrollView>
        {chosen ? (
          <Button
            label="Ver rotas desta paragem"
            onPress={() => router.push({ pathname: "/student/routes", params: { stopId: chosen.id, stopName: chosen.name } })}
          />
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: "absolute", left: 20, right: 20, gap: 10 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 18, paddingHorizontal: 18, minHeight: 56, boxShadow: "0 6px 20px rgba(19, 43, 99, 0.12)" },
  searchInput: { flex: 1, fontSize: 16, color: c.text, minHeight: 54, outlineWidth: 0 },
  sheet: {
    marginTop: -28,
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
    boxShadow: "0 -6px 20px rgba(19, 43, 99, 0.08)",
  },
  handle: { alignSelf: "center", width: 44, height: 5, borderRadius: 3, backgroundColor: "#D3D9E4", marginBottom: 6 },
});
