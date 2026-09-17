import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import {
  createServiceSchema,
  updateServiceSchema,
  listServicesQuerySchema,
  serviceIdParamsSchema,
} from "./services.schema.js";
import { servicesService } from "./services.service.js";

export async function servicesRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const query = listServicesQuerySchema.parse(request.query);
    const result = await servicesService.list(request.tenantId, query);
    return reply.send(result);
  });

  app.get("/:id", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = serviceIdParamsSchema.parse(request.params);
    const service = await servicesService.getById(request.tenantId, id);
    return reply.send(service);
  });

  app.post("/", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = createServiceSchema.parse(request.body);
    const service = await servicesService.create(request.tenantId, input);
    return reply.status(201).send(service);
  });

  app.patch("/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = serviceIdParamsSchema.parse(request.params);
    const input = updateServiceSchema.parse(request.body);
    const service = await servicesService.update(request.tenantId, id, input);
    return reply.send(service);
  });

  app.delete("/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = serviceIdParamsSchema.parse(request.params);
    await servicesService.deactivate(request.tenantId, id);
    return reply.status(204).send();
  });
}
