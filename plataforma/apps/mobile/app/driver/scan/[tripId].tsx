import { useLocalSearchParams } from "expo-router";
import { PassScanner } from "../../../src/pass-scanner.tsx";

export default function ScanScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  return <PassScanner tripId={tripId} />;
}
