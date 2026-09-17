import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import { checkoutSchema } from "./subscriptions.schema.js";
import { subscriptionsService } from "./subscriptions.service.js";

export async function subscriptionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);
  app.addHook("preHandler", ownerOnlyGuard); // solo l'owner gestisce fatturazione

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const subscription = await subscriptionsService.get(request.tenantId);
    return reply.send(subscription);
  });

  app.post("/checkout", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = checkoutSchema.parse(request.body);
    const result = await subscriptionsService.createCheckoutSession(request.tenantId, input);
    return reply.send(result);
  });

  app.post("/cancel", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const subscription = await subscriptionsService.cancel(request.tenantId);
    return reply.send(subscription);
  });
}
