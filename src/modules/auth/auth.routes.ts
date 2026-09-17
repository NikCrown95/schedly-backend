import type { FastifyInstance } from "fastify";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "./auth.schema.js";
import { authService } from "./auth.service.js";
import { authGuard } from "@shared/middleware/auth-guard.js";
import { UnauthorizedError } from "@shared/lib/errors.js";

// Rate limit più severo sulle rotte sensibili al brute force, in aggiunta
// al rate limit globale registrato in app.ts.
const strictAuthRateLimit = {
  config: {
    rateLimit: { max: 10, timeWindow: "1 minute" },
  },
};

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", strictAuthRateLimit, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const result = await authService.register(input);
    return reply.status(201).send(result);
  });

  app.post("/login", strictAuthRateLimit, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await authService.login(input);
    return reply.send(result);
  });

  app.post("/refresh", strictAuthRateLimit, async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    const result = await authService.refresh(input.refreshToken);
    return reply.send(result);
  });

  app.post("/logout", async (request, reply) => {
    const input = refreshSchema.parse(request.body);
    await authService.logout(input.refreshToken);
    return reply.status(204).send();
  });

  app.post("/forgot-password", strictAuthRateLimit, async (request, reply) => {
    const input = forgotPasswordSchema.parse(request.body);
    await authService.forgotPassword(input);
    // Risposta identica indipendentemente dall'esistenza dell'account (anti-enumeration).
    return reply.send({ message: "If an account exists for this email, a reset link has been sent." });
  });

  app.post("/reset-password", strictAuthRateLimit, async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    await authService.resetPassword(input);
    return reply.send({ message: "Password has been reset successfully." });
  });

  app.post("/change-password", { preHandler: authGuard }, async (request, reply) => {
    if (!request.authContext) throw new UnauthorizedError();
    const input = changePasswordSchema.parse(request.body);
    await authService.changePassword(request.authContext.userId, input);
    return reply.send({ message: "Password changed successfully." });
  });
}
