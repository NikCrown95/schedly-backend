import { describe, it, expect } from "vitest";
import { publicCreateAppointmentSchema } from "../src/modules/public-booking/public-booking.schema.js";

const basePayload = {
  serviceId: "11111111-1111-1111-1111-111111111111",
  startAt: "2099-06-15T09:00:00+02:00",
  customer: { firstName: "Mario", phone: "3331234567" },
};

describe("publicCreateAppointmentSchema — source contract", () => {
  it("defaults to WEBSITE when source is omitted", () => {
    const result = publicCreateAppointmentSchema.parse(basePayload);
    expect(result.source).toBe("WEBSITE");
  });

  it("accepts WHATSAPP explicitly — for a future agent booking on the customer's behalf", () => {
    const result = publicCreateAppointmentSchema.parse({ ...basePayload, source: "WHATSAPP" });
    expect(result.source).toBe("WHATSAPP");
  });

  it("rejects ADMIN — that source is reserved for the authenticated endpoint only", () => {
    expect(() => publicCreateAppointmentSchema.parse({ ...basePayload, source: "ADMIN" })).toThrow();
  });
});
