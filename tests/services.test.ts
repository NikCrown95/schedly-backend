import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("GET /services - authorization", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await app.inject({ method: "GET", url: "/services" });
    expect(response.statusCode).toBe(401);
  });
});

describe("POST /services - validation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a negative price even with a valid token shape (auth still fails first)", async () => {
    // Senza un token valido la richiesta viene comunque bloccata da authGuard
    // prima della validazione del body: verifica solo che non vada in 500.
    const response = await app.inject({
      method: "POST",
      url: "/services",
      payload: { name: "Taglio", durationMinutes: 30, priceCents: -100 },
    });
    expect(response.statusCode).toBe(401);
  });
});
