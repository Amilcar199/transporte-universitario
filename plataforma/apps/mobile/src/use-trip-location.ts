import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { api } from "./api.ts";

const FLUSH_MS = 15_000;
/** Limite do servidor por pedido. */
const MAX_BATCH = 50;
const MAX_QUEUE = 200;

interface Point {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  heading?: number;
  recordedAt: string;
}

export type LocationState =
  | { kind: "off" }
  | { kind: "requesting" }
  | { kind: "denied" }
  | { kind: "sharing"; lastSentAt: Date | null; accepted: number; pending: number }
  | { kind: "error"; message: string };

/**
 * Partilha a posição do motorista enquanto `enabled` for verdadeiro (viagem em curso e ecrã aberto).
 * Só usa localização em primeiro plano; o servidor rejeita pontos fora de uma viagem iniciada.
 */
export function useTripLocation(tripId: string, enabled: boolean): LocationState {
  const [state, setState] = useState<LocationState>({ kind: "off" });
  const buffer = useRef<Point[]>([]);

  useEffect(() => {
    if (!enabled) {
      setState({ kind: "off" });
      return;
    }
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;
    let accepted = 0;
    let lastSentAt: Date | null = null;

    const flush = async () => {
      if (buffer.current.length === 0) return;
      const batch = buffer.current.splice(0, MAX_BATCH);
      try {
        const res = await api<{ accepted: number }>(`/driver/trips/${tripId}/locations`, { method: "POST", body: { points: batch } });
        accepted += res.accepted;
        lastSentAt = new Date();
      } catch {
        // Sem rede: os pontos voltam para a fila (limitada, descartando os mais antigos) e seguem no próximo envio.
        buffer.current = [...batch, ...buffer.current].slice(-MAX_QUEUE);
      }
      if (!cancelled) setState({ kind: "sharing", lastSentAt, accepted, pending: buffer.current.length });
    };

    (async () => {
      setState({ kind: "requesting" });
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (perm.status !== "granted") {
        setState({ kind: "denied" });
        return;
      }
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 10_000, distanceInterval: 25 },
          (pos) => {
            buffer.current.push({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              ...(pos.coords.accuracy != null ? { accuracyM: pos.coords.accuracy } : {}),
              ...(pos.coords.speed != null && pos.coords.speed >= 0 ? { speedMps: pos.coords.speed } : {}),
              ...(pos.coords.heading != null && pos.coords.heading >= 0 ? { heading: pos.coords.heading } : {}),
              recordedAt: new Date(pos.timestamp).toISOString(),
            });
          },
        );
        if (cancelled) subscription.remove();
        else setState({ kind: "sharing", lastSentAt: null, accepted: 0, pending: 0 });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Não foi possível obter a localização do dispositivo." });
      }
    })();

    const timer = setInterval(() => void flush(), FLUSH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      subscription?.remove();
      void flush();
    };
  }, [tripId, enabled]);

  return state;
}
