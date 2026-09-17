import { prisma } from "@shared/lib/prisma.js";
import type { Prisma } from "@prisma/client";

export const subscriptionsRepository = {
  findByBusinessId(businessId: string) {
    return prisma.subscription.findUnique({ where: { businessId } });
  },

  findByStripeSubscriptionId(stripeSubscriptionId: string) {
    return prisma.subscription.findUnique({ where: { stripeSubscriptionId } });
  },

  findByStripeCustomerId(stripeCustomerId: string) {
    return prisma.subscription.findUnique({ where: { stripeCustomerId } });
  },

  update(businessId: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({ where: { businessId }, data });
  },

  updateById(id: string, data: Prisma.SubscriptionUpdateInput) {
    return prisma.subscription.update({ where: { id }, data });
  },
};
