import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@shared/lib/prisma.js", () => ({
  prisma: {
    webhookEvent: { create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@modules/subscriptions/subscriptions.repository.js", () => ({
  subscriptionsRepository: {
    update: vi.fn(),
    updateById: vi.fn(),
    findByStripeSubscriptionId: vi.fn(),
  },
}));

vi.mock("@modules/payments/stripe.client.js", () => ({
  stripe: { subscriptions: { retrieve: vi.fn() } },
}));

import { prisma } from "@shared/lib/prisma.js";
import { webhooksService } from "../src/modules/payments/webhooks.service.js";

const mockedPrisma = vi.mocked(prisma, true);

function makeUniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.20.0",
  });
}

describe("webhooksService.handleStripeEvent - idempotency", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips processing silently when the event was already recorded (duplicate delivery)", async () => {
    mockedPrisma.webhookEvent.create.mockRejectedValue(makeUniqueConstraintError());

    await expect(
      webhooksService.handleStripeEvent({
        id: "evt_123",
        type: "customer.subscription.updated",
        data: { object: {} },
      } as never)
    ).resolves.toBeUndefined();

    expect(mockedPrisma.webhookEvent.update).not.toHaveBeenCalled();
  });

  it("re-throws unexpected database errors instead of swallowing them", async () => {
    mockedPrisma.webhookEvent.create.mockRejectedValue(new Error("connection lost"));

    await expect(
      webhooksService.handleStripeEvent({
        id: "evt_456",
        type: "customer.subscription.updated",
        data: { object: {} },
      } as never)
    ).rejects.toThrow("connection lost");
  });
});
