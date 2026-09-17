import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
  customerIdParamsSchema,
} from "./customers.schema.js";
import { customersService } from "./customers.service.js";

export async function customersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const query = listCustomersQuerySchema.parse(request.query);
    const result = await customersService.list(request.tenantId, query);
    return reply.send(result);
  });

  app.get("/:id", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = customerIdParamsSchema.parse(request.params);
    const customer = await customersService.getById(request.tenantId, id);
    return reply.send(customer);
  });

  app.get("/:id/appointments", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = customerIdParamsSchema.parse(request.params);
    const result = await customersService.getHistory(request.tenantId, id);
    return reply.send(result);
  });

  app.post("/", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = createCustomerSchema.parse(request.body);
    const customer = await customersService.create(request.tenantId, input);
    return reply.status(201).send(customer);
  });

  app.patch("/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = customerIdParamsSchema.parse(request.params);
    const input = updateCustomerSchema.parse(request.body);
    const customer = await customersService.update(request.tenantId, id, input);
    return reply.send(customer);
  });
}
