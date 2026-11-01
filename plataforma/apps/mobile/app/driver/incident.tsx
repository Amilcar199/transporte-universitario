import { INCIDENT_KINDS, type IncidentKind } from "@uni/shared";
import { useLocalSearchParams } from "expo-router";
import { api } from "../../src/api.ts";
import { formatDate } from "../../src/format.ts";
import { IncidentForm } from "../../src/incident-form.tsx";
import type { DriverTrip } from "../../src/types.ts";
import { Loading, useLoad } from "../../src/ui.tsx";

export default function DriverIncidentScreen() {
  const params = useLocalSearchParams<{ kind?: string; tripId?: string }>();
  const trips = useLoad(() => api<DriverTrip[]>("/driver/trips"));
  if (trips.loading && !trips.data) return <Loading />;
  const options = (trips.data ?? [])
    .filter((t) => t.status !== "cancelled")
    .slice(0, 6)
    .map((t) => ({ id: t.id, label: `${t.routeCode} ${formatDate(t.serviceDate)} ${t.departureTime}` }));
  const kind = INCIDENT_KINDS.find((k): k is IncidentKind => k === params.kind);
  const tripId = options.some((o) => o.id === params.tripId) ? (params.tripId ?? null) : null;
  return <IncidentForm trips={options} initialKind={kind} initialTripId={tripId} />;
}
