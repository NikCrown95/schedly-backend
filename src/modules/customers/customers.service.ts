import { Prisma } from "@prisma/client";
import { NotFoundError, ConflictError } from "@shared/lib/errors.js";
import { normalizePhoneToE164 } from "@shared/lib/phone.js";
import { customersRepository } from "./customers.repository.js";
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  ListCustomersQuery,
} from "./customers.schema.js";

function isUniquePhoneViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray((err.meta as { target?: string[] })?.target) &&
    (err.meta!.target as string[]).includes("normalized_phone")
  );
}

export const customersService = {
  list(tenantId: string, query: ListCustomersQuery) {
    return customersRepository.list(tenantId, query);
  },

  async getById(tenantId: string, id: string) {
    const customer = await customersRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundError("Customer");
    return customer;
  },

  async getHistory(tenantId: string, id: string) {
    const customer = await customersRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundError("Customer");
    const appointments = await customersRepository.appointmentHistory(tenantId, id);
    return { customer, appointments };
  },

  // Matching riutilizzabile per telefono — pensata per essere chiamata da
  // booking web, dashboard, un futuro import, E domani da un tool dell'agente
  // WhatsApp (get_customer). Non contiene nulla di specifico a un canale.
  findCustomerByPhone(tenantId: string, rawPhone: string) {
    const normalized = normalizePhoneToE164(rawPhone);
    if (!normalized) return null;
    return customersRepository.findByNormalizedPhone(tenantId, normalized);
  },

  // Find-or-create riutilizzabile: usata oggi dal booking pubblico, domani
  // dallo stesso identico punto anche da un agente WhatsApp — nessuna
  // logica di "creazione cliente" duplicata altrove (sezione 9 e 11).
  async findOrCreateCustomer(
    tenantId: string,
    input: { firstName: string; lastName?: string; email?: string; phone?: string }
  ) {
    const normalizedPhone = normalizePhoneToE164(input.phone);

    const existing = normalizedPhone
      ? await customersRepository.findByNormalizedPhone(tenantId, normalizedPhone)
      : input.email
        ? await customersRepository.findByEmail(tenantId, input.email)
        : null;

    if (existing) {
      // Aggiorna solo il nome (un cliente che richiama con lo stesso numero
      // potrebbe aver corretto un refuso nel proprio nome) — non tocchiamo
      // altri campi per non sovrascrivere dati inseriti manualmente dal titolare.
      await customersRepository.update(tenantId, existing.id, { firstName: input.firstName });
      return { customer: { ...existing, firstName: input.firstName }, isNew: false };
    }

    const customer = await customersRepository.create(tenantId, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      normalizedPhone,
    });
    return { customer, isNew: true };
  },

  async create(tenantId: string, input: CreateCustomerInput) {
    const normalizedPhone = normalizePhoneToE164(input.phone);
    try {
      return await customersRepository.create(tenantId, { ...input, normalizedPhone });
    } catch (err) {
      if (isUniquePhoneViolation(err)) {
        throw new ConflictError(
          "CUSTOMER_PHONE_ALREADY_EXISTS",
          "A customer with this phone number already exists for this business."
        );
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateCustomerInput) {
    const existing = await customersRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Customer");

    const data: Record<string, unknown> = { ...input };
    if (input.phone !== undefined) {
      data.normalizedPhone = normalizePhoneToE164(input.phone);
    }

    try {
      await customersRepository.update(tenantId, id, data);
    } catch (err) {
      if (isUniquePhoneViolation(err)) {
        throw new ConflictError(
          "CUSTOMER_PHONE_ALREADY_EXISTS",
          "A customer with this phone number already exists for this business."
        );
      }
      throw err;
    }
    return customersRepository.findById(tenantId, id);
  },
};
