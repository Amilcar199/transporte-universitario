import { api } from "../../src/api.ts";
import { formatDate } from "../../src/format.ts";
import { IncidentForm } from "../../src/incident-form.tsx";
import type { MyBooking } from "../../src/types.ts";
import { useLoad } from "../../src/ui.tsx";

export default function StudentIncidentScreen() {
  const bookings = useLoad(() => api<MyBooking[]>("/bookings/me"));
  const trips = (bookings.data ?? [])
    .filter((b) => ["confirmed", "boarded", "no_show"].includes(b.status))
    .slice(0, 6)
    .map((b) => ({ id: b.tripId, label: `${b.routeCode} ${formatDate(b.serviceDate)} ${b.departureTime}` }));
  return <IncidentForm trips={trips} />;
}
