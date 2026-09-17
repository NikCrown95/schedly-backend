import { NotFoundError, ValidationError } from "@shared/lib/errors.js";
import { availabilityRepository } from "./availability.repository.js";
import { getAvailableSlotsForDate } from "./availability.engine.js";
import { prisma } from "@shared/lib/prisma.js";
import type {
  AvailabilityRuleInput,
  CreateExceptionInput,
  ListExceptionsQuery,
} from "./availability.schema.js";

function toDateOnlyUtc(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// Verifica che non esistano sovrapposizioni tra intervalli dello stesso giorno
// (es. 09:00-13:00 e 12:00-14:00 nello stesso dayOfWeek non sono ammessi).
function assertNoOverlaps(rules: AvailabilityRuleInput[]) {
  const byDay = new Map<number, AvailabilityRuleInput[]>();
  for (const rule of rules) {
    const list = byDay.get(rule.dayOfWeek) ?? [];
    list.push(rule);
    byDay.set(rule.dayOfWeek, list);
  }

  for (const [day, dayRules] of byDay) {
    const sorted = [...dayRules].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        throw new ValidationError(
          `Overlapping availability ranges on day ${day}: ${sorted[i - 1].startTime}-${sorted[i - 1].endTime} and ${sorted[i].startTime}-${sorted[i].endTime}.`
        );
      }
    }
  }
}

export const availabilityService = {
  async getAll(tenantId: string) {
    const [rules, upcomingExceptions] = await Promise.all([
      availabilityRepository.listRules(tenantId),
      availabilityRepository.listExceptionsInRange(
        tenantId,
        new Date(),
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      ),
    ]);
    return { rules, upcomingExceptions };
  },

  async replaceRules(tenantId: string, rules: AvailabilityRuleInput[]) {
    assertNoOverlaps(rules);
    return availabilityRepository.replaceRules(tenantId, rules);
  },

  listExceptions(tenantId: string, query: ListExceptionsQuery) {
    return availabilityRepository.listExceptionsInRange(
      tenantId,
      toDateOnlyUtc(query.from),
      toDateOnlyUtc(query.to)
    );
  },

  async createException(tenantId: string, input: CreateExceptionInput) {
    const date = toDateOnlyUtc(input.date);
    const existing = await availabilityRepository.findExceptionByDate(tenantId, date);
    if (existing) {
      throw new ValidationError("An exception already exists for this date. Delete it first.");
    }
    return availabilityRepository.createException(tenantId, { ...input, date });
  },

  async deleteException(tenantId: string, id: string) {
    const existing = await availabilityRepository.findExceptionById(tenantId, id);
    if (!existing) throw new NotFoundError("Availability exception");
    await availabilityRepository.deleteException(tenantId, id);
  },

  async getSlots(tenantId: string, date: string, serviceId: string) {
    const [business, service] = await Promise.all([
      prisma.business.findUnique({ where: { id: tenantId } }),
      prisma.service.findFirst({ where: { id: serviceId, businessId: tenantId, active: true } }),
    ]);
    if (!business) throw new NotFoundError("Business");
    if (!service) throw new NotFoundError("Service");

    return getAvailableSlotsForDate({
      tenantId,
      timezone: business.timezone,
      date,
      durationMinutes: service.durationMinutes,
    });
  },
};
