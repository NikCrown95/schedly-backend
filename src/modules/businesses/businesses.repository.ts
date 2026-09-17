import { prisma } from "@shared/lib/prisma.js";

export const businessesRepository = {
  // tenantId viene SEMPRE da request.tenantId (derivato dal JWT), mai da input esterno.
  findById(tenantId: string) {
    return prisma.business.findUnique({ where: { id: tenantId } });
  },

  update(tenantId: string, data: Record<string, unknown>) {
    return prisma.business.update({ where: { id: tenantId }, data });
  },
};
