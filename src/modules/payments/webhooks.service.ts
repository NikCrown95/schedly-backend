import type Stripe from "stripe";
import { Prisma, SubscriptionStatus, SubscriptionPlan } from "@prisma/client";
import { prisma } from "@shared/lib/prisma.js";
import { logger } from "@shared/lib/logger.js";
import { subscriptionsRepository } from "@modules/subscriptions/subscriptions.repository.js";
import { stripe } from "./stripe.client.js";

// Mappa gli stati Stripe sugli stati interni. Stripe ha più granularità (incomplete,
// incomplete_expired, unpaid, ...) che semplifichiamo sui 5 stati che il prodotto
// usa davvero — se in futuro servirà distinguerli ulteriormente, la mappa è il
// singolo punto da estendere.
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "trialing":
      return SubscriptionStatus.TRIALING;
    case "active":
      return SubscriptionStatus.ACTIVE;
    case "past_due":
    case "unpaid":
      return SubscriptionStatus.PAST_DUE;
    case "canceled":
    case "incomplete_expired":
      return SubscriptionStatus.CANCELLED;
    default:
      return SubscriptionStatus.EXPIRED;
  }
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const businessId = subscription.metadata?.businessId;
  const planRaw = subscription.metadata?.plan;
  const plan =
    planRaw === "PRO" || planRaw === "BUSINESS" ? SubscriptionPlan[planRaw] : undefined;

  if (!businessId) {
    logger.warn(
      { stripeSubscriptionId: subscription.id },
      "Stripe subscription has no businessId metadata — cannot map to a tenant."
    );
    return;
  }

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await subscriptionsRepository.update(businessId, {
    ...(plan ? { plan } : {}),
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export const webhooksService = {
  // Idempotenza: se l'evento (per event.id univoco Stripe) è già stato registrato,
  // non lo riprocessiamo — Stripe reinvia gli eventi in caso di timeout/errore
  // di risposta, e processarli due volte non deve avere effetti duplicati.
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    let logRow;
    try {
      logRow = await prisma.webhookEvent.create({
        data: {
          provider: "stripe",
          eventId: event.id,
          eventType: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        logger.info({ eventId: event.id }, "Stripe webhook event already processed — skipping.");
        return;
      }
      throw err;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (typeof session.subscription === "string") {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            await upsertSubscriptionFromStripe(subscription);
          }
          break;
        }

        case "customer.subscription.updated":
        case "customer.subscription.created": {
          await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const businessId = subscription.metadata?.businessId;
          if (businessId) {
            await subscriptionsRepository.update(businessId, {
              status: SubscriptionStatus.CANCELLED,
            });
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          if (typeof invoice.subscription === "string") {
            const existing = await subscriptionsRepository.findByStripeSubscriptionId(
              invoice.subscription
            );
            if (existing) {
              await subscriptionsRepository.updateById(existing.id, {
                status: SubscriptionStatus.PAST_DUE,
              });
            }
          }
          break;
        }

        case "invoice.payment_succeeded": {
          const invoice = event.data.object as Stripe.Invoice;
          if (typeof invoice.subscription === "string") {
            const existing = await subscriptionsRepository.findByStripeSubscriptionId(
              invoice.subscription
            );
            if (existing && existing.status === SubscriptionStatus.PAST_DUE) {
              await subscriptionsRepository.updateById(existing.id, {
                status: SubscriptionStatus.ACTIVE,
              });
            }
          }
          break;
        }

        default:
          logger.info({ eventType: event.type }, "Unhandled Stripe event type — ignored.");
      }

      await prisma.webhookEvent.update({
        where: { id: logRow.id },
        data: { processedAt: new Date(), businessId: extractBusinessId(event) },
      });
    } catch (err) {
      logger.error({ err, eventId: event.id }, "Failed to process Stripe webhook event.");
      throw err;
    }
  },
};

function extractBusinessId(event: Stripe.Event): string | undefined {
  const obj = event.data.object as { metadata?: { businessId?: string } };
  return obj.metadata?.businessId;
}
