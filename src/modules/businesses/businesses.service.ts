import { NotFoundError } from "@shared/lib/errors.js";
import { businessesRepository } from "./businesses.repository.js";
import type { UpdateBusinessInput } from "./businesses.schema.js";

export const businessesService = {
  async getBusiness(tenantId: string) {
    const business = await businessesRepository.findById(tenantId);
    if (!business) throw new NotFoundError("Business");
    return business;
  },

  async updateBusiness(tenantId: string, input: UpdateBusinessInput) {
    // Nota: lo slug NON è modificabile da questo endpoint nell'MVP — cambiare lo
    // slug pubblico rompe eventuali link di prenotazione già condivisi dal
    // professionista. Se servirà, andrà gestito con un flusso dedicato (redirect
    // dal vecchio slug o conferma esplicita).
    return businessesRepository.update(tenantId, input);
  },
};
