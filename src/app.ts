import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";

import { env } from "@config/env.js";
import { redis } from "@shared/lib/redis.js";
import { registerErrorHandler } from "@shared/middleware/error-handler.js";
import { authRoutes } from "@modules/auth/auth.routes.js";
import { usersRoutes } from "@modules/users/users.routes.js";
import { businessesRoutes } from "@modules/businesses/businesses.routes.js";
import { servicesRoutes } from "@modules/services/services.routes.js";
import { availabilityRoutes } from "@modules/availability/availability.routes.js";
import { customersRoutes } from "@modules/customers/customers.routes.js";
import { appointmentsRoutes } from "@modules/appointments/appointments.routes.js";
import { publicBookingRoutes } from "@modules/public-booking/public-booking.routes.js";
import { subscriptionsRoutes } from "@modules/subscriptions/subscriptions.routes.js";
import { webhooksRoutes } from "@modules/payments/webhooks.routes.js";

export async function buildApp() {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN.split(","),
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT", "OPTIONS"],
  });

  // Helmet imposta gli header di sicurezza standard (X-Content-Type-Options,
  // X-Frame-Options, Referrer-Policy, HSTS, ecc.). La Content-Security-Policy di
  // default è pensata per pagine HTML: qui serviamo solo JSON tranne /docs
  // (Swagger UI), quindi la disabilitiamo per non rischiare di rompere quella UI
  // e ci affidiamo comunque a tutti gli altri header di protezione.
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cookie);

  // Content-type parser custom per application/json: per la rotta webhook Stripe
  // dobbiamo preservare il body come Buffer grezzo (necessario per verificare la
  // firma HMAC sui byte esatti ricevuti), per tutte le altre rotte il comportamento
  // è identico al parser JSON di default di Fastify.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      if (request.url.startsWith("/webhooks/stripe")) {
        done(null, body);
        return;
      }
      try {
        const json = body.length ? JSON.parse(body.toString("utf8")) : {};
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Rate limit globale di base, con storage su Redis: necessario perché in
  // produzione l'app gira su più istanze (orizzontalmente scalata) e un rate
  // limit in-memory per singolo processo non proteggerebbe l'API nel suo insieme.
  // Le rotte pubbliche di prenotazione hanno limiti più stringenti per-rotta
  // (Fase 7); il login ha inoltre una protezione account-level separata (Fase 10,
  // vedi login-attempt-guard.ts) che il rate limit per-IP da solo non copre.
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis,
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Schedly API", version: "0.1.0" },
      servers: [{ url: env.APP_URL }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  registerErrorHandler(app as Parameters<typeof registerErrorHandler>[0]);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/me" });
  await app.register(businessesRoutes, { prefix: "/business" });
  await app.register(servicesRoutes, { prefix: "/services" });
  await app.register(availabilityRoutes, { prefix: "/availability" });
  await app.register(customersRoutes, { prefix: "/customers" });
  await app.register(appointmentsRoutes, { prefix: "/appointments" });
  await app.register(publicBookingRoutes, { prefix: "/public" });
  await app.register(subscriptionsRoutes, { prefix: "/subscription" });
  await app.register(webhooksRoutes, { prefix: "/webhooks" });

  // Moduli successivi (Fase 10+): security hardening (CORS/rate-limit fini,
  // audit log) — nessun nuovo modulo di dominio, si rifiniscono quelli esistenti.

  return app;
}
