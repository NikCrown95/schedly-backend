import { prisma } from "@shared/lib/prisma.js";
import type { ListCustomersQuery } from "./customers.schema.js";

export const customersRepository = {
  async list(tenantId: string, query: ListCustomersQuery) {
    const where = {
      businessId: tenantId,
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: "insensitive" as const } },
              { lastName: { contains: query.search, mode: "insensitive" as const } },
              { email: { contains: query.search, mode: "insensitive" as const } },
              { phone: { contains: query.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  findById(tenantId: string, id: string) {
    return prisma.customer.findFirst({ where: { id, businessId: tenantId } });
  },

  // Matching per telefono NORMALIZZATO (E.164), tenant-scoped — questa è la
  // funzione riutilizzabile richiesta per il futuro agente: stesso metodo
  // per booking web, dashboard, import, e domani WhatsApp.
  findByNormalizedPhone(tenantId: string, normalizedPhone: string) {
    return prisma.customer.findFirst({
      where: { businessId: tenantId, normalizedPhone },
    });
  },

  findByEmail(tenantId: string, email: string) {
    return prisma.customer.findFirst({ where: { businessId: tenantId, email } });
  },

  create(tenantId: string, data: Record<string, unknown>) {
    return prisma.customer.create({ data: { ...data, businessId: tenantId } });
  },

  update(tenantId: string, id: string, data: Record<string, unknown>) {
    return prisma.customer.updateMany({ where: { id, businessId: tenantId }, data });
  },

  appointmentHistory(tenantId: string, customerId: string) {
    return prisma.appointment.findMany({
      where: { businessId: tenantId, customerId },
      include: { service: true },
      orderBy: { startAt: "desc" },
    });
  },
};
