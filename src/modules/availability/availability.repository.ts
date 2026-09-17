import { prisma } from "@shared/lib/prisma.js";
import type { AvailabilityRuleInput, CreateExceptionInput } from "./availability.schema.js";

export const availabilityRepository = {
  listRules(tenantId: string) {
    return prisma.availabilityRule.findMany({
      where: { businessId: tenantId, staffMemberId: null }, // single-calendar nell'MVP
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  },

  // Sostituisce l'intero set di regole in una transazione (delete + createMany).
  async replaceRules(tenantId: string, rules: AvailabilityRuleInput[]) {
    await prisma.$transaction([
      prisma.availabilityRule.deleteMany({ where: { businessId: tenantId, staffMemberId: null } }),
      prisma.availabilityRule.createMany({
        data: rules.map((r) => ({ ...r, businessId: tenantId })),
      }),
    ]);
    return availabilityRepository.listRules(tenantId);
  },

  listExceptionsInRange(tenantId: string, fromDate: Date, toDate: Date) {
    return prisma.availabilityException.findMany({
      where: {
        businessId: tenantId,
        staffMemberId: null,
        date: { gte: fromDate, lte: toDate },
      },
      orderBy: { date: "asc" },
    });
  },

  findExceptionByDate(tenantId: string, date: Date) {
    return prisma.availabilityException.findFirst({
      where: { businessId: tenantId, staffMemberId: null, date },
    });
  },

  createException(tenantId: string, input: CreateExceptionInput & { date: Date }) {
    return prisma.availabilityException.create({
      data: { ...input, businessId: tenantId },
    });
  },

  findExceptionById(tenantId: string, id: string) {
    return prisma.availabilityException.findFirst({ where: { id, businessId: tenantId } });
  },

  deleteException(tenantId: string, id: string) {
    return prisma.availabilityException.deleteMany({ where: { id, businessId: tenantId } });
  },

  // Appuntamenti attivi del giorno (in UTC), usati dal motore slot per escludere orari occupati.
  listActiveAppointmentsInRange(tenantId: string, fromUtc: Date, toUtc: Date) {
    return prisma.appointment.findMany({
      where: {
        businessId: tenantId,
        status: { notIn: ["CANCELLED"] },
        startAt: { lt: toUtc },
        endAt: { gt: fromUtc },
      },
      select: { startAt: true, endAt: true },
    });
  },
};
