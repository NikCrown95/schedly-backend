import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import { updateBusinessSchema } from "./businesses.schema.js";
import { businessesService } from "./businesses.service.js";

export async function businessesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const business = await businessesService.getBusiness(request.tenantId);
    return reply.send(business);
  });

  app.patch("/", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = updateBusinessSchema.parse(request.body);
    const business = await businessesService.updateBusiness(request.tenantId, input);
    return reply.send(business);
  });
}
