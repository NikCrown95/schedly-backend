import { NotFoundError, ValidationError } from "@shared/lib/errors.js";
import { prisma } from "@shared/lib/prisma.js";
import { SubscriptionStatus } from "@prisma/client";
import { env } from "@config/env.js";
import { stripe } from "@modules/payments/stripe.client.js";
import { subscriptionsRepository } from "./subscriptions.repository.js";
import type { CheckoutInput } from "./subscriptions.schema.js";

// Nomi e prezzi dei piani sono configurabili via env (price ID Stripe), mai
// hardcoded nel codice — sezione 14 dell'architettura.
const PRICE_ID_BY_PLAN: Record<CheckoutInput["plan"], string | undefined> = {
  PRO: env.STRIPE_PRICE_ID_PRO,
  BUSINESS: env.STRIPE_PRICE_ID_BUSINESS,
};

export const subscriptionsService = {
  async get(tenantId: string) {
    const subscription = await subscriptionsRepository.findByBusinessId(tenantId);
    if (!subscription) throw new NotFoundError("Subscription");
    return subscription;
  },

  async createCheckoutSession(tenantId: string, input: CheckoutInput) {
    const priceId = PRICE_ID_BY_PLAN[input.plan];
    if (!priceId) {
      throw new ValidationError(`No Stripe price configured for plan ${input.plan}.`);
    }

    const [business, subscription] = await Promise.all([
      prisma.business.findUnique({ where: { id: tenantId } }),
      subscriptionsRepository.findByBusinessId(tenantId),
    ]);
    if (!business) throw new NotFoundError("Business");
    if (!subscription) throw new NotFoundError("Subscription");

    // Riusa il customer Stripe esistente se già creato in un checkout precedente,
    // altrimenti lascia che sia Stripe Checkout a crearne uno nuovo.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: subscription.stripeCustomerId ?? undefined,
      customer_email: subscription.stripeCustomerId ? undefined : (business.email ?? undefined),
      client_reference_id: business.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { businessId: business.id, plan: input.plan },
      },
      success_url: `${env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_URL}/billing/cancelled`,
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    return { checkoutUrl: session.url };
  },

  // Cancellazione "at period end": il business resta attivo fino alla fine del
  // periodo già pagato — comportamento standard SaaS, evita rimborsi pro-rata.
  // Lo stato definitivo (CANCELLED) viene comunque confermato dal webhook
  // `customer.subscription.deleted`, non impostato otticamente qui.
  async cancel(tenantId: string) {
    const subscription = await subscriptionsRepository.findByBusinessId(tenantId);
    if (!subscription) throw new NotFoundError("Subscription");

    if (!subscription.stripeSubscriptionId) {
      // Nessun abbonamento Stripe attivo (es. ancora in TRIAL): cancelliamo solo
      // localmente, impostando lo stato finale subito.
      return subscriptionsRepository.update(tenantId, {
        status: SubscriptionStatus.CANCELLED,
        cancelAtPeriodEnd: true,
      });
    }

    await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    return subscriptionsRepository.update(tenantId, { cancelAtPeriodEnd: true });
  },
};
