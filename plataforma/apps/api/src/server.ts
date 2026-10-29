import { buildApp } from "./app.ts";
import { openDatabase } from "./db/client.ts";
import { loadEnv } from "./env.ts";
import { createPaymentProviders } from "./payments/providers.ts";
import { expireSubscriptions } from "./services/billing.ts";

const env = loadEnv();
const handle = await openDatabase(env.DATABASE_URL);
const app = await buildApp({ db: handle.db, env, payments: createPaymentProviders(env), now: () => new Date() }, { logger: true });

const runExpiry = async () => {
  try {
    const expired = await expireSubscriptions(handle.db, new Date());
    if (expired > 0) app.log.info({ expired }, "subscrições expiradas");
  } catch (err) {
    app.log.error({ err }, "falha ao expirar subscrições");
  }
};
await runExpiry();
const expiryTimer = setInterval(runExpiry, 60 * 60 * 1000);

const shutdown = async () => {
  clearInterval(expiryTimer);
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port: env.PORT, host: env.HOST });
app.log.info(`API (${handle.kind}) em http://localhost:${env.PORT}/api/v1`);
