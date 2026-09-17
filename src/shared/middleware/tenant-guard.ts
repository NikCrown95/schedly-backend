import type { FastifyReply, FastifyRequest } from "fastify";
import { ForbiddenError, UnauthorizedError } from "@shared/lib/errors.js";

// Da usare DOPO authGuard su ogni rotta privata "tenant-scoped".
// Garantisce che esista un businessId nel token e lo espone come request.tenantId.
// I repository devono SEMPRE filtrare per request.tenantId, mai per un valore
// preso da params/body — questo è ciò che previene l'accesso cross-tenant (IDOR).
declare module "fastify" {
  interface FastifyRequest {
    tenantId?: string;
  }
}

export async function tenantGuard(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.authContext) {
    throw new UnauthorizedError();
  }

  if (!request.authContext.businessId) {
    throw new ForbiddenError("No active business associated with this account.");
  }

  request.tenantId = request.authContext.businessId;
}

// Guardia per rotte riservate solo all'owner/admin del business (es. gestione abbonamento).
export async function ownerOnlyGuard(request: FastifyRequest, _reply: FastifyReply) {
  if (request.authContext?.role !== "OWNER" && request.authContext?.role !== "ADMIN") {
    throw new ForbiddenError("Only the business owner can perform this action.");
  }
}
