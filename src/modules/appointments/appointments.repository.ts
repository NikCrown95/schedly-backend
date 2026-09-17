import { prisma } from "@shared/lib/prisma.js";
import type { Prisma } from "@prisma/client";
import type { ListAppointmentsQuery } from "./appointments.schema.js";

export const appointmentsRepository = {
  async list(tenantId: string, query: ListAppointmentsQuery) {
    const where: Prisma.AppointmentWhereInput = {
      businessId: tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.from || query.to
        ? {
            startAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where,
        include: { service: true, customer: true },
        orderBy: { startAt: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.appointment.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  findById(tenantId: string, id: string) {
    return prisma.appointment.findFirst({
      where: { id, businessId: tenantId },
      include: { service: true, customer: true },
    });
  },

  // Controllo applicativo (prima linea di difesa): un appuntamento attivo
  // sovrappone [startAt, endAt) se startAt < existing.endAt AND endAt > existing.startAt.
  // excludeId serve per il reschedule, per non confrontare l'appuntamento con se stesso.
  findOverlapping(
    tenantId: string,
    staffMemberId: string | null,
    startAt: Date,
    endAt: Date,
    excludeId?: string
  ) {
    return prisma.appointment.findFirst({
      where: {
        businessId: tenantId,
        staffMemberId,
        status: { notIn: ["CANCELLED"] },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  },

  create(tenantId: string, data: Prisma.AppointmentUncheckedCreateInput) {
    return prisma.appointment.create({
      data: { ...data, businessId: tenantId },
      include: { service: true, customer: true },
    });
  },

  update(tenantId: string, id: string, data: Prisma.AppointmentUpdateInput) {
    return prisma.appointment.updateMany({ where: { id, businessId: tenantId }, data });
  },

  cancel(tenantId: string, id: string, cancelledBy: "business" | "customer") {
    return prisma.appointment.updateMany({
      where: { id, businessId: tenantId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy },
    });
  },
};
