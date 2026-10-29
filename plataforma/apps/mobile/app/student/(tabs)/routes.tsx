import { LABELS, type RouteServiceType } from "@uni/shared";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { api, ApiError } from "../../../src/api.ts";
import { useAuth } from "../../../src/auth.tsx";
import { formatDistance } from "../../../src/format.ts";
import type { RouteSummary, University } from "../../../src/types.ts";
import { Badge, Body, Button, Card, Chip, DemoTag, Empty, ErrorBox, Field, Loading, Row, Screen, Subtitle, useLoad } from "../../../src/ui.tsx";

interface StopHit {
  id: string;
  name: string;
  neighbourhood: string | null;
  landmark: string | null;
  kind: "pickup" | "destination";
  isDemo: boolean;
  distanceMeters?: number;
}

export default function RoutesTab() {
  const { me } = useAuth();
  const verifiedUni = me?.student?.verificationStatus === "approved" ? me.student.universityId : null;
  const [universityId, setUniversityId] = useState<string | null>(verifiedUni);
  const [serviceType, setServiceType] = useState<RouteServiceType>("university");
  const [stop, setStop] = useState<StopHit | null>(null);
  const [query, setQuery] = useState("");
  const [stopHits, setStopHits] = useState<StopHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const universities = useLoad(() => api<University[]>("/universities"));
  const routes = useLoad(() => {
    const params = new URLSearchParams({ serviceType });
    if (universityId && serviceType === "university") params.set("universityId", universityId);
    if (stop) params.set("stopId", stop.id);
    return api<RouteSummary[]>(`/routes?${params}`);
  }, [serviceType, universityId, stop?.id]);

  async function searchStops(nearMe: boolean) {
    setSearching(true);
    setSearchError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (universityId && serviceType === "university") params.set("universityId", universityId);
      if (nearMe) {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== "granted") {
          setSearchError("Sem autorização de localização. Pode pesquisar a paragem pelo nome ou bairro.");
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        params.set("lat", String(pos.coords.latitude));
        params.set("lng", String(pos.coords.longitude));
      }
      const hits = await api<StopHit[]>(`/stops/search?${params}`);
      setStopHits(hits.filter((h) => h.kind === "pickup"));
    } catch (err) {
      setSearchError(err instanceof ApiError ? err.message : "Não foi possível obter a localização.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <Screen onRefresh={() => void routes.reload()} refreshing={routes.loading}>
      <Card>
        <Subtitle>Tipo de serviço</Subtitle>
        <Row>
          <Chip label={LABELS.serviceType.university} selected={serviceType === "university"} onPress={() => setServiceType("university")} />
          <Chip label={LABELS.serviceType.intercity} selected={serviceType === "intercity"} onPress={() => setServiceType("intercity")} />
        </Row>
        {serviceType === "intercity" ? (
          <Body muted>As viagens intercidades exigem reserva e só estão disponíveis se o seu plano as incluir, com limite por período.</Body>
        ) : (
          <>
            <Subtitle>Universidade</Subtitle>
            <Row>
              <Chip label="Todas" selected={!universityId} onPress={() => setUniversityId(null)} />
              {universities.data?.map((u) => (
                <Chip key={u.id} label={u.shortName} selected={universityId === u.id} onPress={() => setUniversityId(u.id)} />
              ))}
            </Row>
          </>
        )}
      </Card>

      <Card>
        <Subtitle>Paragem</Subtitle>
        {stop ? (
          <Row>
            <Body>{stop.name}</Body>
            <Button label="Limpar" variant="secondary" onPress={() => setStop(null)} />
          </Row>
        ) : (
          <>
            <Field label="Nome, bairro ou referência" value={query} onChangeText={setQuery} placeholder="Ex.: Viana, Kilamba" onSubmitEditing={() => void searchStops(false)} />
            <Row>
              <View style={{ flex: 1 }}>
                <Button label="Pesquisar" onPress={() => void searchStops(false)} busy={searching} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Perto de mim" variant="secondary" onPress={() => void searchStops(true)} disabled={searching} />
              </View>
            </Row>
            <ErrorBox message={searchError} />
            {stopHits?.length === 0 ? <Empty>Nenhuma paragem encontrada em rotas activas.</Empty> : null}
            {stopHits?.map((s) => (
              <Pressable key={s.id} onPress={() => setStop(s)} style={{ paddingVertical: 8, borderTopWidth: 1, borderColor: "#eee" }}>
                <Row>
                  <Body>{s.name}</Body>
                  <DemoTag show={s.isDemo} />
                  {s.distanceMeters !== undefined ? <Badge label={formatDistance(s.distanceMeters)} tone="info" /> : null}
                </Row>
                {s.neighbourhood || s.landmark ? <Body muted>{[s.neighbourhood, s.landmark].filter(Boolean).join(" · ")}</Body> : null}
              </Pressable>
            ))}
          </>
        )}
      </Card>

      <Subtitle>Rotas disponíveis</Subtitle>
      <ErrorBox message={routes.error} onRetry={() => void routes.reload()} />
      {routes.loading && !routes.data ? <Loading /> : null}
      {routes.data?.length === 0 ? <Empty>Não há rotas activas para estes filtros.</Empty> : null}
      {routes.data?.map((r) => (
        <Pressable key={r.id} onPress={() => router.push(`/student/route/${r.id}`)}>
          <Card>
            <Row>
              <Badge label={r.code} tone="info" />
              {r.serviceType === "intercity" ? <Badge label={LABELS.serviceType.intercity} tone="warning" /> : null}
              <DemoTag show={r.isDemo} />
            </Row>
            <Body>{r.name}</Body>
            {r.serviceType === "university" ? (
              <Body muted>
                {LABELS.direction[r.direction]} · {r.universities.join(", ")}
              </Body>
            ) : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
