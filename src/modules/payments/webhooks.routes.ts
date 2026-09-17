import type { FastifyInstance } from "fastify";
import { stripe } from "./stripe.client.js";
import { webhooksService } from "./webhooks.service.js";
import { env } from "@config/env.js";
import { logger } from "@shared/lib/logger.js";

export async function webhooksRoutes(app: FastifyInstance) {
  // Il body di questa rotta è il Buffer grezzo (vedi il content-type parser
  // custom in app.ts) — necessario perché stripe.webhooks.constructEvent
  // verifica la firma sui byte esatti ricevuti, non su un JSON ri-serializzato.
  app.post("/stripe", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      return reply.status(400).send({ error: { code: "MISSING_SIGNATURE", message: "Missing Stripe-Signature header." } });
    }
    if (!env.STRIPE_WEBHOOK_SECRET) {
      logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook.");
      return reply.status(500).send({ error: { code: "WEBHOOK_NOT_CONFIGURED", message: "Webhook secret not configured." } });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body as Buffer,
        signature,
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      logger.warn({ err }, "Stripe webhook signature verification failed.");
      return reply.status(400).send({ error: { code: "INVALID_SIGNATURE", message: "Webhook signature verification failed." } });
    }

    try {
      await webhooksService.handleStripeEvent(event);
    } catch (err) {
      // Rispondiamo comunque 500 così Stripe ritenterà l'invio più tardi.
      logger.error({ err, eventId: event.id }, "Error while processing Stripe webhook.");
      return reply.status(500).send({ error: { code: "WEBHOOK_PROCESSING_FAILED", message: "Failed to process webhook." } });
    }

    return reply.status(200).send({ received: true });
  });
}
