import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@shared/lib/prisma.js", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    customer: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@modules/availability/availability.engine.js", () => ({
  isWithinOpenHours: vi.fn(),
}));

vi.mock("@modules/notifications/notifications.service.js", () => ({
  sendNotification: vi.fn(),
}));

vi.mock("../src/modules/appointments/appointments.repository.js", () => ({
  appointmentsRepository: {
    findById: vi.fn(),
    findOverlapping: vi.fn(),
    update: vi.fn(),
  },
}));

import { prisma } from "@shared/lib/prisma.js";
import { isWithinOpenHours } from "@modules/availability/availability.engine.js";
import { appointmentsRepository } from "../src/modules/appointments/appointments.repository.js";
import { appointmentsService } from "../src/modules/appointments/appointments.service.js";

const mockedPrisma = vi.mocked(prisma, true);
const mockedIsWithinOpenHours = vi.mocked(isWithinOpenHours);
const mockedRepo = vi.mocked(appointmentsRepository, true);

describe("appointmentsService.create — price/duration snapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("copies the service's CURRENT price and duration onto the new appointment", async () => {
    mockedPrisma.business.findUnique.mockResolvedValue({ id: "b1", timezone: "Europe/Rome" } as never);
    mockedPrisma.service.findFirst.mockResolvedValue({
      id: "s1",
      businessId: "b1",
      durationMinutes: 45,
      priceCents: 3000,
      active: true,
      name: "Colore",
    } as never);
    mockedPrisma.customer.findFirst.mockResolvedValue({ id: "c1", businessId: "b1" } as never);
    mockedIsWithinOpenHours.mockResolvedValue(true);

    let capturedCreateData: Record<string, unknown> | undefined;
    mockedPrisma.$transaction.mockImplementation(async (cb: never) => {
      const tx = {
        appointment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation(({ data }) => {
            capturedCreateData = data;
            return { id: "a1", ...data };
          }),
        },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    });

    await appointmentsService.create(
      "b1",
      { serviceId: "s1", customerId: "c1", startAt: "2099-06-15T09:00:00+02:00" },
      "WEBSITE"
    );

    expect(capturedCreateData?.priceCents).toBe(3000);
    expect(capturedCreateData?.durationMinutes).toBe(45);
    expect(capturedCreateData?.source).toBe("WEBSITE");
  });
});

describe("appointmentsService.update — reschedule uses the historical snapshot", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recomputes endAt from the appointment's OWN stored duration, not the service's current one", async () => {
    // Il servizio oggi dura 60 minuti, ma questo appuntamento fu prenotato
    // quando durava 30 — deve restare 30 al reschedule.
    mockedRepo.findById.mockResolvedValue({
      id: "a1",
      businessId: "b1",
      status: "CONFIRMED",
      startAt: new Date("2099-06-15T07:00:00Z"),
      endAt: new Date("2099-06-15T07:30:00Z"),
      durationMinutes: 30, // snapshot storico
      staffMemberId: null,
      service: { id: "s1", durationMinutes: 60, name: "Taglio uomo" }, // durata CORRENTE, diversa
    } as never);
    mockedPrisma.business.findUnique.mockResolvedValue({ id: "b1", timezone: "Europe/Rome" } as never);
    mockedIsWithinOpenHours.mockResolvedValue(true);
    mockedRepo.findOverlapping.mockResolvedValue(null);
    mockedRepo.update.mockResolvedValue({ count: 1 } as never);

    await appointmentsService.update("b1", "a1", { startAt: "2099-06-15T10:00:00+02:00" });

    const [, , updateData] = mockedRepo.update.mock.calls[0] as unknown as [
      string,
      string,
      { startAt: Date; endAt: Date },
    ];

    const durationUsedMs = updateData.endAt.getTime() - updateData.startAt.getTime();
    expect(durationUsedMs).toBe(30 * 60_000); // 30 minuti, non 60
  });
});
