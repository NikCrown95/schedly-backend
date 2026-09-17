import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { ownerOnlyGuard, tenantGuard } from "@shared/middleware/tenant-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import {
  createAppointmentSchema,
  updateAppointmentSchema,
  listAppointmentsQuerySchema,
  appointmentIdParamsSchema,
} from "./appointments.schema.js";
import { appointmentsService } from "./appointments.service.js";

export async function appointmentsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);
  app.addHook("preHandler", tenantGuard);

  app.get("/", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const query = listAppointmentsQuerySchema.parse(request.query);
    const result = await appointmentsService.list(request.tenantId, query);
    return reply.send(result);
  });

  app.get("/:id", async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = appointmentIdParamsSchema.parse(request.params);
    const appointment = await appointmentsService.getById(request.tenantId, id);
    return reply.send(appointment);
  });

  app.post("/", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const input = createAppointmentSchema.parse(request.body);
    // Un appuntamento creato dall'endpoint autenticato è sempre "ADMIN": non
    // fidarsi mai di un source scelto dal client su questa rotta.
    const appointment = await appointmentsService.create(request.tenantId, input, "ADMIN");
    return reply.status(201).send(appointment);
  });

  app.patch("/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = appointmentIdParamsSchema.parse(request.params);
    const input = updateAppointmentSchema.parse(request.body);
    const appointment = await appointmentsService.update(request.tenantId, id, input);
    return reply.send(appointment);
  });

  app.delete("/:id", { preHandler: ownerOnlyGuard }, async (request, reply) => {
    if (!request.tenantId) throw new UnauthorizedError();
    const { id } = appointmentIdParamsSchema.parse(request.params);
    await appointmentsService.cancel(request.tenantId, id);
    return reply.status(204).send();
  });
}
