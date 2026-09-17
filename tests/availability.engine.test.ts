import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock del repository PRIMA di importare il modulo che lo usa (hoisting di vi.mock).
vi.mock("../src/modules/availability/availability.repository.js", () => ({
  availabilityRepository: {
    findExceptionByDate: vi.fn(),
    listRules: vi.fn(),
    listActiveAppointmentsInRange: vi.fn(),
  },
}));

import { availabilityRepository } from "../src/modules/availability/availability.repository.js";
import { getAvailableSlotsForDate } from "../src/modules/availability/availability.engine.js";

const mockedRepo = vi.mocked(availabilityRepository, true);

describe("availability engine - getAvailableSlotsForDate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Usiamo una data lontana nel futuro per non incappare nel filtro "scarta orari passati".
  const FUTURE_DATE = "2099-06-15"; // lunedì

  it("returns no slots when an exception marks the day as closed", async () => {
    mockedRepo.findExceptionByDate.mockResolvedValue({
      id: "x",
      businessId: "b1",
      staffMemberId: null,
      date: new Date(),
      isClosed: true,
      startTime: null,
      endTime: null,
      reason: "Ferie",
      createdAt: new Date(),
    } as never);

    const slots = await getAvailableSlotsForDate({
      tenantId: "b1",
      timezone: "Europe/Rome",
      date: FUTURE_DATE,
      durationMinutes: 30,
    });

    expect(slots).toEqual([]);
    expect(mockedRepo.listRules).not.toHaveBeenCalled();
  });

  it("generates slots from recurring rules when no exception exists", async () => {
    mockedRepo.findExceptionByDate.mockResolvedValue(null);
    mockedRepo.listRules.mockResolvedValue([
      { id: "r1", businessId: "b1", staffMemberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    mockedRepo.listActiveAppointmentsInRange.mockResolvedValue([]);

    const slots = await getAvailableSlotsForDate({
      tenantId: "b1",
      timezone: "Europe/Rome",
      date: FUTURE_DATE, // lunedì → dayOfWeek luxon-normalizzato = 1
      durationMinutes: 30,
      stepMinutes: 30,
    });

    // 09:00-10:00 con slot da 30' e step 30' → esattamente 2 slot: 09:00 e 09:30
    expect(slots).toHaveLength(2);
    expect(slots[0].startAt).toContain("07:00"); // 09:00 Europe/Rome (CEST, UTC+2) = 07:00 UTC
  });

  it("excludes slots that overlap an existing appointment", async () => {
    mockedRepo.findExceptionByDate.mockResolvedValue(null);
    mockedRepo.listRules.mockResolvedValue([
      { id: "r1", businessId: "b1", staffMemberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "10:00", createdAt: new Date(), updatedAt: new Date() },
    ] as never);
    // Appuntamento che occupa 09:00-09:30 UTC+2 locale → 07:00-07:30 UTC
    mockedRepo.listActiveAppointmentsInRange.mockResolvedValue([
      { startAt: new Date("2099-06-15T07:00:00Z"), endAt: new Date("2099-06-15T07:30:00Z") },
    ] as never);

    const slots = await getAvailableSlotsForDate({
      tenantId: "b1",
      timezone: "Europe/Rome",
      date: FUTURE_DATE,
      durationMinutes: 30,
      stepMinutes: 30,
    });

    // Solo lo slot 09:30-10:00 dovrebbe restare disponibile
    expect(slots).toHaveLength(1);
    expect(slots[0].startAt).toContain("07:30");
  });
});
