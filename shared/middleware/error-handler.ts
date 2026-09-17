import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { AppError } from "@shared/lib/errors.js";
import { env } from "@config/env.js";

// Formato di risposta errore coerente in tutta l'API:
// { "error": { "code": "...", "message": "...", "details"?: ... } }
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      request.log.warn({ code: error.code, err: error }, "handled application error");
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
    }

    if (error instanceof ZodError) {
      return reply.status(422).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data.",
          details: error.flatten(),
        },
      });
    }

    // Errore non previsto: logga tutto internamente, esponi solo un messaggio generico.
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        // Solo in sviluppo, per debug locale
        ...(env.NODE_ENV !== "production" && error instanceof Error
          ? { details: error.message }
          : {}),
      },
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({
      error: { code: "ROUTE_NOT_FOUND", message: "This endpoint does not exist." },
    });
  });
}
