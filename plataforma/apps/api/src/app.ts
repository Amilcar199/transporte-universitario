import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppContext } from "./context.ts";
import { errorHandler } from "./errors.ts";
import { adminFleetRoutes } from "./routes/admin-fleet.ts";
import { adminMiscRoutes } from "./routes/admin-misc.ts";
import { adminNetworkRoutes } from "./routes/admin-network.ts";
import { adminPartnerRoutes } from "./routes/admin-partners.ts";
import { adminPeopleRoutes } from "./routes/admin-people.ts";
import { adminReportRoutes } from "./routes/admin-reports.ts";
import { adminTripRoutes } from "./routes/admin-trips.ts";
import { authRoutes } from "./routes/auth.ts";
import { billingAdminRoutes } from "./routes/billing-admin.ts";
import { billingStudentRoutes } from "./routes/billing-student.ts";
import { driverRoutes } from "./routes/driver.ts";
import { incidentRoutes } from "./routes/incidents.ts";
import { passRoutes } from "./routes/passes.ts";
import { studentRoutes } from "./routes/student.ts";

export async function buildApp(ctx: AppContext, options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger
      ? {
          level: ctx.env.NODE_ENV === "production" ? "info" : "debug",
          // Nunca registar credenciais nem tokens.
          redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"],
        }
      : false,
    trustProxy: ctx.env.NODE_ENV === "production",
    bodyLimit: 256 * 1024,
  });
  app.decorate("ctx", ctx);
  app.decorateRequest("auth", null);
  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: ctx.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  });
  await app.register(rateLimit, { global: false });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(studentRoutes);
      await api.register(billingStudentRoutes);
      await api.register(passRoutes);
      await api.register(driverRoutes);
      await api.register(incidentRoutes);
      await api.register(adminNetworkRoutes);
      await api.register(adminFleetRoutes);
      await api.register(adminTripRoutes);
      await api.register(adminPeopleRoutes);
      await api.register(adminMiscRoutes);
      await api.register(billingAdminRoutes);
      await api.register(adminPartnerRoutes);
      await api.register(adminReportRoutes);
    },
    { prefix: "/api/v1" },
  );

  return app;
}
