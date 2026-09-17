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

import { prisma } from "@shared/lib/prisma.js";
import { isWithinOpenHours } from "@modules/availability/availability.engine.js";
import { appointmentsService } from "../src/modules/appointments/appointments.service.js";
import { AppointmentNotAvailableError, ValidationError } from "@shared/lib/errors.js";

const mockedPrisma = vi.mocked(prisma, true);
const mockedIsWithinOpenHours = vi.mocked(isWithinOpenHours);

describe("appointmentsService.create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.business.findUnique.mockResolvedValue({
      id: "b1",
      timezone: "Europe/Rome",
    } as never);
    mockedPrisma.service.findFirst.mockResolvedValue({
      id: "s1",
      businessId: "b1",
      durationMinutes: 30,
      priceCents: 2000,
      active: true,
    } as never);
    mockedPrisma.customer.findFirst.mockResolvedValue({
      id: "c1",
      businessId: "b1",
      email: "cliente@example.com",
    } as never);
  });

  it("rejects a time outside business hours before touching the database transaction", async () => {
    mockedIsWithinOpenHours.mockResolvedValue(false);

    await expect(
      appointmentsService.create(
        "b1",
        { serviceId: "s1", customerId: "c1", startAt: "2099-06-15T20:00:00+02:00" },
        "ADMIN"
      )
    ).rejects.toBeInstanceOf(ValidationError);

    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects when the transaction finds an overlapping active appointment", async () => {
    mockedIsWithinOpenHours.mockResolvedValue(true);
    mockedPrisma.$transaction.mockImplementation(async (cb: never) => {
      const tx = {
        appointment: {
          findFirst: vi.fn().mockResolvedValue({ id: "existing-appt" }),
          create: vi.fn(),
        },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    });

    await expect(
      appointmentsService.create(
        "b1",
        { serviceId: "s1", customerId: "c1", startAt: "2099-06-15T09:00:00+02:00" },
        "ADMIN"
      )
    ).rejects.toBeInstanceOf(AppointmentNotAvailableError);
  });

  it("creates the appointment when the slot is open and free", async () => {
    mockedIsWithinOpenHours.mockResolvedValue(true);
    const created = { id: "new-appt", status: "CONFIRMED" };
    mockedPrisma.$transaction.mockImplementation(async (cb: never) => {
      const tx = {
        appointment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(created),
        },
      };
      return (cb as (tx: unknown) => Promise<unknown>)(tx);
    });

    const result = await appointmentsService.create(
      "b1",
      { serviceId: "s1", customerId: "c1", startAt: "2099-06-15T09:00:00+02:00" },
      "WEBSITE"
    );

    expect(result).toEqual(created);
  });
});
