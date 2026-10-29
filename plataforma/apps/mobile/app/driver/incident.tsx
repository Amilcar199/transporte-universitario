import { api } from "../../src/api.ts";
import { formatDate } from "../../src/format.ts";
import { IncidentForm } from "../../src/incident-form.tsx";
import type { DriverTrip } from "../../src/types.ts";
import { useLoad } from "../../src/ui.tsx";

export default function DriverIncidentScreen() {
  const trips = useLoad(() => api<DriverTrip[]>("/driver/trips"));
  const options = (trips.data ?? [])
    .filter((t) => t.status !== "cancelled")
    .slice(0, 6)
    .map((t) => ({ id: t.id, label: `${t.routeCode} ${formatDate(t.serviceDate)} ${t.departureTime}` }));
  return <IncidentForm trips={options} />;
}
