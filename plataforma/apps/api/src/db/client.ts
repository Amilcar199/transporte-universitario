import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
}

export const migrationsFolder = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Abre a base de dados indicada em DATABASE_URL e aplica as migrações pendentes. */
export async function openDatabase(url: string, options: { migrate?: boolean } = {}): Promise<DbHandle> {
  const runMigrations = options.migrate ?? true;
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const target = url.slice("pglite:".length);
    let client;
    if (target === "memory") {
      client = new PGlite();
    } else {
      const dir = resolve(target);
      mkdirSync(dir, { recursive: true });
      client = new PGlite(dir);
    }
    const db = drizzle({ client, schema }) as unknown as Db;
    if (runMigrations) {
      const { migrate } = await import("drizzle-orm/pglite/migrator");
      await migrate(db as never, { migrationsFolder });
    }
    return { db, kind: "pglite", close: () => client.close() };
  }

  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    const pg = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new pg.default.Pool({ connectionString: url, max: 10 });
    const db = drizzle({ client: pool, schema }) as unknown as Db;
    if (runMigrations) {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      await migrate(db as never, { migrationsFolder });
    }
    return { db, kind: "postgres", close: () => pool.end() };
  }

  throw new Error("DATABASE_URL deve começar por postgres://, postgresql:// ou pglite:");
}
