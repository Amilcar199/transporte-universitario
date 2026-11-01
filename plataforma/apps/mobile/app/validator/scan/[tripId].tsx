import { useLocalSearchParams } from "expo-router";
import { PassScanner } from "../../../src/pass-scanner.tsx";

export default function ValidatorScanScreen() {
  const { tripId, route } = useLocalSearchParams<{ tripId: string; route?: string }>();
  return <PassScanner tripId={tripId} routeLabel={route} fallback="/validator" />;
}
