import { brand, WEEKDAY_LABELS } from "@uni/shared";

const LUANDA_OFFSET_MS = 60 * 60 * 1000;

/** Data de hoje em Luanda (UTC+1, sem horário de Verão), no formato AAAA-MM-DD. */
export function luandaToday(now = new Date()): string {
  return new Date(now.getTime() + LUANDA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

/** Data por extenso curta, por exemplo «05 nov 2026». */
export function formatLongDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

/** «Hoje», «Amanhã» ou a data curta. */
export function relativeDay(date: string, today = luandaToday()): string {
  if (date === today) return "Hoje";
  if (date === addDays(today, 1)) return "Amanhã";
  return formatDate(date);
}

export function luandaHour(now = new Date()): number {
  return new Date(now.getTime() + LUANDA_OFFSET_MS).getUTCHours();
}

/** Hora actual em Luanda, no formato HH:MM. */
export function luandaTime(now = new Date()): string {
  return new Date(now.getTime() + LUANDA_OFFSET_MS).toISOString().slice(11, 16);
}

/** Fracção já decorrida de um período entre duas datas (0 a 1). */
export function periodProgress(start: string, end: string, today: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const t = Date.parse(`${today}T00:00:00Z`);
  if (e <= s) return 1;
  return Math.max(0, Math.min(1, (t - s) / (e - s)));
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-PT", { timeZone: brand.timeZone, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatDays(days: number[]): string {
  const sorted = [...days].sort();
  if (sorted.join(",") === "1,2,3,4,5") return "Seg a Sex";
  if (sorted.length === 7) return "Todos os dias";
  return sorted.map((d) => WEEKDAY_LABELS[d]).join(", ");
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
