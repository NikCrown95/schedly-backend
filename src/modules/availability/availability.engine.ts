import { DateTime } from "luxon";
import { availabilityRepository } from "./availability.repository.js";

interface TimeWindow {
  startLocal: DateTime;
  endLocal: DateTime;
}

// Calcola le finestre orarie aperte (già risolte eccezione-vs-regole ricorrenti) per
// una data specifica. Riutilizzata sia dalla generazione slot sia dalla validazione
// "questo appuntamento rientra nell'orario di apertura?" in appointments.service.
export async function getOpenWindowsForDate(
  tenantId: string,
  timezone: string,
  date: string
): Promise<{ windows: TimeWindow[]; dayStartLocal: DateTime }> {
  const dayStartLocal = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  if (!dayStartLocal.isValid) {
    throw new Error("Invalid date or timezone.");
  }
  const dayOfWeek = dayStartLocal.weekday % 7;

  const dateOnlyUtc = new Date(
    Date.UTC(dayStartLocal.year, dayStartLocal.month - 1, dayStartLocal.day)
  );
  const exception = await availabilityRepository.findExceptionByDate(tenantId, dateOnlyUtc);

  if (exception) {
    if (exception.isClosed) {
      return { windows: [], dayStartLocal };
    }
    return {
      windows: [
        {
          startLocal: setLocalTime(dayStartLocal, exception.startTime!),
          endLocal: setLocalTime(dayStartLocal, exception.endTime!),
        },
      ],
      dayStartLocal,
    };
  }

  const rules = await availabilityRepository.listRules(tenantId);
  const windows = rules
    .filter((r) => r.dayOfWeek === dayOfWeek)
    .map((r) => ({
      startLocal: setLocalTime(dayStartLocal, r.startTime),
      endLocal: setLocalTime(dayStartLocal, r.endTime),
    }));

  return { windows, dayStartLocal };
}

// Verifica che l'intervallo [startAtUtc, endAtUtc) rientri INTERAMENTE in una delle
// finestre orarie aperte per quel giorno. Non controlla sovrapposizioni con altri
// appuntamenti: quello è responsabilità di appointments.service (che usa anche la
// exclusion constraint DB come ultima linea di difesa contro le race condition).
export async function isWithinOpenHours(
  tenantId: string,
  timezone: string,
  startAtUtc: Date,
  endAtUtc: Date
): Promise<boolean> {
  const localDate = DateTime.fromJSDate(startAtUtc, { zone: timezone }).toISODate();
  if (!localDate) return false;

  const { windows } = await getOpenWindowsForDate(tenantId, timezone, localDate);
  const start = DateTime.fromJSDate(startAtUtc, { zone: "utc" });
  const end = DateTime.fromJSDate(endAtUtc, { zone: "utc" });

  return windows.some((w) => start >= w.startLocal.toUTC() && end <= w.endLocal.toUTC());
}

interface GetSlotsInput {
  tenantId: string;
  timezone: string;
  date: string; // "YYYY-MM-DD", nel timezone del business
  durationMinutes: number;
  // Passo tra uno slot proposto e il successivo. 15' è un compromesso ragionevole
  // per la maggior parte dei professionisti (parrucchieri, personal trainer, ecc.);
  // in futuro potrebbe diventare una configurazione per business.
  stepMinutes?: number;
}

export interface Slot {
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
}

// Calcola gli slot prenotabili per una singola data, in una singola timezone.
// Logica:
//  1. Se esiste un'eccezione "chiuso" per la data → nessuno slot.
//  2. Se esiste un'eccezione con orario custom → usa quella come unica finestra.
//  3. Altrimenti usa le AvailabilityRule ricorrenti per quel giorno della settimana.
//  4. Sottrae gli appuntamenti già attivi (non cancellati) in quella giornata.
//  5. Genera slot di durata `durationMinutes`, avanzando di `stepMinutes` alla volta,
//     scartando quelli che si sovrappongono a un appuntamento esistente o che
//     escono dalla finestra disponibile.
export async function getAvailableSlotsForDate(input: GetSlotsInput): Promise<Slot[]> {
  const { tenantId, timezone, date, durationMinutes } = input;
  const stepMinutes = input.stepMinutes ?? 15;

  const { windows, dayStartLocal } = await getOpenWindowsForDate(tenantId, timezone, date);
  if (windows.length === 0) return [];

  const dayStartUtc = dayStartLocal.toUTC().toJSDate();
  const dayEndUtc = dayStartLocal.plus({ days: 1 }).toUTC().toJSDate();
  const existingAppointments = await availabilityRepository.listActiveAppointmentsInRange(
    tenantId,
    dayStartUtc,
    dayEndUtc
  );

  const slots: Slot[] = [];

  for (const window of windows) {
    let cursor = window.startLocal;
    while (cursor.plus({ minutes: durationMinutes }) <= window.endLocal) {
      const slotStart = cursor;
      const slotEnd = cursor.plus({ minutes: durationMinutes });

      const overlaps = existingAppointments.some((appt) => {
        const apptStart = DateTime.fromJSDate(appt.startAt, { zone: "utc" });
        const apptEnd = DateTime.fromJSDate(appt.endAt, { zone: "utc" });
        return slotStart.toUTC() < apptEnd && slotEnd.toUTC() > apptStart;
      });

      const isPast = slotStart.toUTC() < DateTime.utc();

      if (!overlaps && !isPast) {
        slots.push({
          startAt: slotStart.toUTC().toISO()!,
          endAt: slotEnd.toUTC().toISO()!,
        });
      }

      cursor = cursor.plus({ minutes: stepMinutes });
    }
  }

  return slots;
}

function setLocalTime(day: DateTime, hhmm: string): DateTime {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}
