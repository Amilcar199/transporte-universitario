import { loadEnv } from "../env.ts";
import { openDatabase } from "./client.ts";

const env = loadEnv();
const handle = await openDatabase(env.DATABASE_URL, { migrate: true });
console.log(`Migrações aplicadas (${handle.kind}).`);
await handle.close();
