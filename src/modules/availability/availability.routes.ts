import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import {
  putAvailabilitySchema,
  createExceptionSchema,
  listExceptionsQuerySchema,
  slotsQuerySchema,
  exceptionIdParamsSchema,
} from "./availability.schema.js";
import { availabilityService } from "./availability.service.js";

export async function availabilityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const result = await availabilityService.getAll(request.tenantId);
    return reply.send(result);
  });

  app.put("/", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = putAvailabilitySchema.parse(request.body);
    const rules = await availabilityService.replaceRules(request.tenantId, input.rules);
    return reply.send({ rules });
  });

  app.get("/exceptions", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const query = listExceptionsQuerySchema.parse(request.query);
    const exceptions = await availabilityService.listExceptions(request.tenantId, query);
    return reply.send(exceptions);
  });

  app.post("/exceptions", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = createExceptionSchema.parse(request.body);
    const exception = await availabilityService.createException(request.tenantId, input);
    return reply.status(201).send(exception);
  });

  app.delete("/exceptions/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = exceptionIdParamsSchema.parse(request.params);
    await availabilityService.deleteException(request.tenantId, id);
    return reply.status(204).send();
  });

  // Endpoint di anteprima per il professionista, per verificare il proprio calendario.
  // La stessa logica (availability.engine) verrà riutilizzata dalla prenotazione
  // pubblica in Fase 7.
  app.get("/slots", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const query = slotsQuerySchema.parse(request.query);
    const slots = await availabilityService.getSlots(request.tenantId, query.date, query.serviceId);
    return reply.send({ date: query.date, slots });
  });
}
