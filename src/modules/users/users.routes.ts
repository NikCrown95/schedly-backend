import type { FastifyInstance } from "fastify";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";
import { updateProfileSchema } from "./users.schema.js";
import { usersService } from "./users.service.js";

export async function usersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/", async (request, reply) => {
    if (!request.authContext) throw new UnauthorizedError();
    const result = await usersService.getProfile(request.authContext.userId);
    return reply.send(result);
  });

  app.patch("/", async (request, reply) => {
    if (!request.authContext) throw new UnauthorizedError();
    const input = updateProfileSchema.parse(request.body);
    const result = await usersService.updateProfile(request.authContext.userId, input);
    return reply.send(result);
  });
}
