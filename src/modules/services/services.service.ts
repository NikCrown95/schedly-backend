import { NotFoundError, ValidationError } from "@shared/lib/errors.js";
import { servicesRepository } from "./services.repository.js";
import type { CreateServiceInput, UpdateServiceInput, ListServicesQuery } from "./services.schema.js";

export const servicesService = {
  list(tenantId: string, query: ListServicesQuery) {
    return servicesRepository.list(tenantId, query);
  },

  async getById(tenantId: string, id: string) {
    const service = await servicesRepository.findById(tenantId, id);
    if (!service) throw new NotFoundError("Service");
    return service;
  },

  create(tenantId: string, input: CreateServiceInput) {
    return servicesRepository.create(tenantId, input);
  },

  async update(tenantId: string, id: string, input: UpdateServiceInput) {
    const existing = await servicesRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Service");

    const result = await servicesRepository.update(tenantId, id, input);
    if (result.count === 0) throw new NotFoundError("Service");

    return servicesRepository.findById(tenantId, id);
  },

  // "DELETE" disattiva il servizio (soft delete) — non viene mai rimosso fisicamente
  // se ha appuntamenti storici associati, per preservare l'integrità dei dati.
  async deactivate(tenantId: string, id: string) {
    const existing = await servicesRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Service");

    const future = await servicesRepository.hasFutureAppointments(tenantId, id);
    if (future) {
      throw new ValidationError(
        "This service has upcoming appointments. Cancel or complete them before disabling it."
      );
    }

    await servicesRepository.deactivate(tenantId, id);
  },
};
