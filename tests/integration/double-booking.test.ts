import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { registerBusiness, authHeader } from "./helpers.js";

describe("Appointments — concurrent double-booking (real DB race)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts exactly one of two simultaneous requests for the same slot", async () => {
    const business = await registerBusiness(app);
    const headers = authHeader(business.accessToken);

    // Lunedì 09:00-10:00 — vedi anche availability.engine.test.ts per la stessa data di riferimento.
    await app.inject({
      method: "PUT",
      url: "/availability",
      headers,
      payload: { rules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }] },
    });

    const serviceResponse = await app.inject({
      method: "POST",
      url: "/services",
      headers,
      payload: { name: "Taglio", durationMinutes: 30, priceCents: 2000 },
    });
    const serviceId = serviceResponse.json().id;

    const customerResponse = await app.inject({
      method: "POST",
      url: "/customers",
      headers,
      payload: { firstName: "Cliente", lastName: "Test" },
    });
    const customerId = customerResponse.json().id;

    const payload = {
      serviceId,
      customerId,
      startAt: "2099-06-15T09:00:00+02:00", // lunedì, dentro la finestra 09:00-10:00
    };

    // Le due richieste partono davvero in parallelo: è questo che esercita
    // l'exclusion constraint DB (appointments_no_overlap) e non solo il
    // controllo applicativo, che da solo non basterebbe in caso di vera
    // concorrenza a livello di connessioni DB separate.
    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/appointments", headers, payload }),
      app.inject({ method: "POST", url: "/appointments", headers, payload }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    expect(statuses).toEqual([201, 409]);

    const failed = first.statusCode === 409 ? first : second;
    expect(failed.json().error.code).toBe("APPOINTMENT_NOT_AVAILABLE");
  });
});
