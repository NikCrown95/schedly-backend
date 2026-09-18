import type { Prisma } from "@prisma/client";
import { prisma } from "@shared/lib/prisma.js";
import type { ListServicesQuery } from "./services.schema.js";

export const servicesRepository = {
  // tenantId viene sempre da request.tenantId — mai da input esterno.
  async list(tenantId: string, query: ListServicesQuery) {
    const where = {
      businessId: tenantId,
      ...(query.active !== undefined ? { active: query.active } : {}),
    };

    const [items, total] = await prisma.$transaction([
      prisma.service.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.service.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  },

  findById(tenantId: string, id: string) {
    return prisma.service.findFirst({ where: { id, businessId: tenantId } });
  },

  create(tenantId: string, data: Omit<Prisma.ServiceUncheckedCreateInput, "businessId" | "id" | "createdAt" | "updatedAt">) {
    return prisma.service.create({ data: { ...data, businessId: tenantId } });
  },

  update(tenantId: string, id: string, data: Prisma.ServiceUpdateManyMutationInput) {
    // updateMany invece di update: se l'id non appartiene al tenant, count sarà 0
    // invece di sollevare un errore Prisma generico — lo gestiamo esplicitamente nel service.
    return prisma.service.updateMany({ where: { id, businessId: tenantId }, data });
  },

  // Soft delete: disattiva il servizio invece di eliminarlo, per preservare
  // l'integrità storica degli appuntamenti passati che lo referenziano.
  deactivate(tenantId: string, id: string) {
    return prisma.service.updateMany({
      where: { id, businessId: tenantId },
      data: { active: false },
    });
  },

  hasFutureAppointments(tenantId: string, serviceId: string) {
    return prisma.appointment.findFirst({
      where: {
        businessId: tenantId,
        serviceId,
        startAt: { gt: new Date() },
        status: { notIn: ["CANCELLED"] },
      },
    });
  },
};
