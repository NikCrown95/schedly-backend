import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "../src/modules/notifications/email-templates.js";

describe("renderEmailTemplate", () => {
  it("renders the verify-email template with a working link", () => {
    const result = renderEmailTemplate("auth.verify_email", {
      appUrl: "https://app.schedly.io",
      verifyToken: "abc123",
    });
    expect(result.text).toContain("https://app.schedly.io/verify-email?token=abc123");
    expect(result.subject).toContain("Verify your email");
  });

  it("renders the appointment.created template with customer and service details", () => {
    const result = renderEmailTemplate("appointment.created", {
      businessName: "Demo Salon",
      serviceName: "Taglio uomo",
      customerName: "Mario",
      formattedStart: "Monday 15 June 2099 at 09:00",
    });
    expect(result.text).toContain("Mario");
    expect(result.text).toContain("Taglio uomo");
    expect(result.subject).toContain("Demo Salon");
  });

  it("falls back to a generic template for an unknown event type", () => {
    const result = renderEmailTemplate("some.unmapped.event", { foo: "bar" });
    expect(result.subject).toContain("some.unmapped.event");
  });
});
