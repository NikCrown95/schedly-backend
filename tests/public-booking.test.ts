import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@shared/lib/prisma.js";
import { publicBookingService } from "../src/modules/public-booking/public-booking.service.js";
import { NotFoundError } from "@shared/lib/errors.js";

const mockedPrisma = vi.mocked(prisma, true);

describe("publicBookingService - anti-enumeration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("treats a non-existent slug as NotFound", async () => {
    mockedPrisma.business.findUnique.mockResolvedValue(null as never);
    await expect(publicBookingService.getBusinessProfile("does-not-exist")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("treats a SUSPENDED business the same way as a non-existent one", async () => {
    mockedPrisma.business.findUnique.mockResolvedValue({
      id: "b1",
      slug: "salone-sospeso",
      status: "SUSPENDED",
      subscription: { status: "ACTIVE" },
    } as never);

    await expect(publicBookingService.getBusinessProfile("salone-sospeso")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it("treats a business without an active/trialing subscription the same way", async () => {
    mockedPrisma.business.findUnique.mockResolvedValue({
      id: "b1",
      slug: "salone-scaduto",
      status: "ACTIVE",
      subscription: { status: "EXPIRED" },
    } as never);

    await expect(publicBookingService.getBusinessProfile("salone-scaduto")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
