import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

// Questi test usano un mock del repository/DB in memoria non è ancora presente
// in questa fase (richiede un database di test — vedi README, sezione Test,
// da completare in Fase 11 con un setup DB dedicato). Per ora copriamo la
// validazione dei payload, che non richiede persistenza.

describe("POST /auth/register - validation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a registration with an invalid email", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "not-an-email",
        password: "password123",
        firstName: "Mario",
        lastName: "Rossi",
        businessName: "Salone Mario",
      },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a registration with a short password", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email: "mario@example.com",
        password: "short",
        firstName: "Mario",
        lastName: "Rossi",
        businessName: "Salone Mario",
      },
    });

    expect(response.statusCode).toBe(422);
  });
});

describe("POST /business - authorization", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects an unauthenticated request", async () => {
    const response = await app.inject({ method: "GET", url: "/business" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed Authorization header", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/business",
      headers: { authorization: "not-a-bearer-token" },
    });
    expect(response.statusCode).toBe(401);
  });
});
