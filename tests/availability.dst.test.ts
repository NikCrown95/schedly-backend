import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Cambi ora legale europei reali del 2026 (verificati): 29 marzo (avanti, si
// perde l'ora 02:00-03:00) e 25 ottobre (indietro, l'ora 02:00-03:00 si ripete).
// Un business con orario 09:00-18:00 non tocca mai l'ora "saltata/ripetuta",
// ma il test verifica che il motore calcoli comunque la giornata senza
// eccezioni e con i confini orari corretti — la classe di bug più comune con
// il DST è un cambio di durata implicito nel giorno che sballa i confini.
describe("availability engine — DST transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRepo.findExceptionByDate.mockResolvedValue(null);
    mockedRepo.listActiveAppointmentsInRange.mockResolvedValue([]);
    mockedRepo.listRules.mockResolvedValue([
      { id: "r1", businessId: "b1", staffMemberId: null, dayOfWeek: 0, startTime: "09:00", endTime: "18:00", createdAt: new Date(), updatedAt: new Date() },
    ] as never);
  });

  it("computes slots correctly on the spring-forward date (29 March 2026, Sunday)", async () => {
    const slots = await getAvailableSlotsForDate({
      tenantId: "b1",
      timezone: "Europe/Rome",
      date: "2026-03-29",
      durationMinutes: 30,
      stepMinutes: 30,
    });

    expect(slots.length).toBeGreaterThan(0);
    // L'ultimo slot da 30' che finisce esattamente alle 18:00 locali deve
    // esistere, a dimostrazione che i confini apertura/chiusura non si sono
    // spostati per via del salto d'ora avvenuto prima nella stessa giornata.
    const lastSlotEndLocal = new Date(slots[slots.length - 1].endAt).toLocaleTimeString("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(lastSlotEndLocal).toBe("18:00");
  });

  it("computes slots correctly on the fall-back date (25 October 2026, Sunday)", async () => {
    const slots = await getAvailableSlotsForDate({
      tenantId: "b1",
      timezone: "Europe/Rome",
      date: "2026-10-25",
      durationMinutes: 30,
      stepMinutes: 30,
    });

    expect(slots.length).toBeGreaterThan(0);
    const lastSlotEndLocal = new Date(slots[slots.length - 1].endAt).toLocaleTimeString("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    expect(lastSlotEndLocal).toBe("18:00");
  });
});
