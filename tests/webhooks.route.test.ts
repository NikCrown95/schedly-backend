import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

vi.mock("@modules/payments/stripe.client.js", () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(() => {
        throw new Error("No signatures found matching the expected signature for payload");
      }),
    },
    checkout: { sessions: { create: vi.fn() } },
    subscriptions: { update: vi.fn(), retrieve: vi.fn() },
  },
}));

import { buildApp } from "../src/app.js";

describe("POST /webhooks/stripe — signature verification", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a request with no Stripe-Signature header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("MISSING_SIGNATURE");
  });

  it("rejects a request with an invalid Stripe-Signature (constructEvent throws)", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/webhooks/stripe",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1,v1=not_a_real_signature",
      },
      payload: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("INVALID_SIGNATURE");
  });
});
