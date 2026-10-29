import { getTableName, sql, type Column, type SQL } from "drizzle-orm";
import { z } from "zod";
import { brand } from "@uni/shared";
import type { DbOrTx } from "./db/client.ts";
import { notifications } from "./db/schema.ts";

/**
 * Referência "tabela"."coluna" para usar dentro de subconsultas correlacionadas. Em selects sem joins o Drizzle
 * escreve as colunas sem tabela, e um "id" solto dentro da subconsulta passaria a referir a tabela interior.
 */
export function qualified(column: Column): SQL {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}

/** Data local (YYYY-MM-DD) no fuso horário da operação. */
export function localDate(now: Date, timeZone: string = brand.timeZone): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Hora local (HH:MM) no fuso horário da operação. */
export function localTime(now: Date, timeZone: string = brand.timeZone): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data YYYY-MM-DD. */
export function isoWeekday(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minutos entre a meia-noite e HH:MM. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function timePlusMinutes(time: string, minutes: number): string {
  const total = (minutesOf(time) + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Distância em metros entre duas coordenadas (fórmula de haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (AAAA-MM-DD).");
export const timeSchema = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Hora inválida (HH:MM).");
export const uuidParam = z.object({ id: z.string().uuid("Identificador inválido.") });

export const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export function ilikeAny(search: string | undefined, ...columns: SQL[]): SQL | undefined {
  if (!search) return undefined;
  const pattern = `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return sql`(${sql.join(
    columns.map((c) => sql`${c} ilike ${pattern}`),
    sql` or `,
  )})`;
}

/** Cria uma notificação na aplicação. Com `dedupeKey`, o mesmo evento não gera duplicados. */
export async function notify(
  db: DbOrTx,
  input: { userId: string; title: string; body: string; kind?: string; dedupeKey?: string },
): Promise<void> {
  await db
    .insert(notifications)
    .values({
      userId: input.userId,
      title: input.title,
      body: input.body,
      kind: input.kind ?? "info",
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing();
}
