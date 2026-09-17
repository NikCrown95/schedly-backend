import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { registerBusiness, authHeader } from "./helpers.js";

describe("Tenant isolation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("business B cannot read a customer created by business A, even knowing its ID", async () => {
    const businessA = await registerBusiness(app);
    const businessB = await registerBusiness(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/customers",
      headers: authHeader(businessA.accessToken),
      payload: { firstName: "Mario", lastName: "Rossi" },
    });
    expect(createResponse.statusCode).toBe(201);
    const customerId = createResponse.json().id;

    // Business A vede il proprio cliente.
    const okResponse = await app.inject({
      method: "GET",
      url: `/customers/${customerId}`,
      headers: authHeader(businessA.accessToken),
    });
    expect(okResponse.statusCode).toBe(200);

    // Business B, con lo stesso ID, deve ricevere 404 — non 403, per non
    // confermare nemmeno l'esistenza della risorsa (stesso comportamento di un
    // ID inesistente).
    const crossTenantResponse = await app.inject({
      method: "GET",
      url: `/customers/${customerId}`,
      headers: authHeader(businessB.accessToken),
    });
    expect(crossTenantResponse.statusCode).toBe(404);
  });

  it("business B cannot list business A's services", async () => {
    const businessA = await registerBusiness(app);
    const businessB = await registerBusiness(app);

    await app.inject({
      method: "POST",
      url: "/services",
      headers: authHeader(businessA.accessToken),
      payload: { name: "Taglio uomo", durationMinutes: 30, priceCents: 2000 },
    });

    const listResponse = await app.inject({
      method: "GET",
      url: "/services",
      headers: authHeader(businessB.accessToken),
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toHaveLength(0);
  });

  it("business B cannot MODIFY a service belonging to business A", async () => {
    const businessA = await registerBusiness(app);
    const businessB = await registerBusiness(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/services",
      headers: authHeader(businessA.accessToken),
      payload: { name: "Taglio uomo", durationMinutes: 30, priceCents: 2000 },
    });
    const serviceId = createResponse.json().id;

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/services/${serviceId}`,
      headers: authHeader(businessB.accessToken),
      payload: { priceCents: 1 },
    });
    expect(patchResponse.statusCode).toBe(404);

    // Verifica che il prezzo di business A NON sia stato alterato.
    const stillOwned = await app.inject({
      method: "GET",
      url: `/services/${serviceId}`,
      headers: authHeader(businessA.accessToken),
    });
    expect(stillOwned.json().priceCents).toBe(2000);
  });

  it("business B cannot DELETE (deactivate) a service belonging to business A", async () => {
    const businessA = await registerBusiness(app);
    const businessB = await registerBusiness(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/services",
      headers: authHeader(businessA.accessToken),
      payload: { name: "Taglio uomo", durationMinutes: 30, priceCents: 2000 },
    });
    const serviceId = createResponse.json().id;

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/services/${serviceId}`,
      headers: authHeader(businessB.accessToken),
    });
    expect(deleteResponse.statusCode).toBe(404);

    const stillActive = await app.inject({
      method: "GET",
      url: `/services/${serviceId}`,
      headers: authHeader(businessA.accessToken),
    });
    expect(stillActive.json().active).toBe(true);
  });

  it("business B cannot MODIFY a customer belonging to business A", async () => {
    const businessA = await registerBusiness(app);
    const businessB = await registerBusiness(app);

    const createResponse = await app.inject({
      method: "POST",
      url: "/customers",
      headers: authHeader(businessA.accessToken),
      payload: { firstName: "Mario", lastName: "Rossi" },
    });
    const customerId = createResponse.json().id;

    const patchResponse = await app.inject({
      method: "PATCH",
      url: `/customers/${customerId}`,
      headers: authHeader(businessB.accessToken),
      payload: { firstName: "Hacked" },
    });
    expect(patchResponse.statusCode).toBe(404);
  });
});
