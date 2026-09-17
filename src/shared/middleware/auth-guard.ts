import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "@shared/lib/jwt.js";
import { UnauthorizedError } from "@shared/lib/errors.js";

// Estende il tipo FastifyRequest con il contesto utente autenticato.
// authContext è l'UNICA fonte di verità per userId/businessId/role a valle:
// nessun handler deve mai fidarsi di un business_id passato in params/body/query.
declare module "fastify" {
  interface FastifyRequest {
    authContext?: {
      userId: string;
      businessId?: string;
      role: string;
    };
  }
}

export async function authGuard(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header.");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = verifyAccessToken(token);
    request.authContext = {
      userId: payload.sub,
      businessId: payload.businessId,
      role: payload.role,
    };
  } catch {
    throw new UnauthorizedError("Invalid or expired access token.");
  }
}
