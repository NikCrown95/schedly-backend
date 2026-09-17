import { NotFoundError, ValidationError, ForbiddenError } from "@shared/lib/errors.js";
import type { AppointmentSource } from "@prisma/client";
import { getAvailableSlotsForDate } from "@modules/availability/availability.engine.js";
import { appointmentsService } from "@modules/appointments/appointments.service.js";
import { customersService } from "@modules/customers/customers.service.js";
import { normalizePhoneToE164 } from "@shared/lib/phone.js";
import { env } from "@config/env.js";
import { publicBookingRepository } from "./public-booking.repository.js";
import type {
  PublicCreateAppointmentInput,
  PublicCancelAppointmentInput,
} from "./public-booking.schema.js";

async function requireBookableBusiness(slug: string) {
  const business = await publicBookingRepository.findBookableBusinessBySlug(slug);
  if (!business) throw new NotFoundError("Business");
  return business;
}

export const publicBookingService = {
  async getBusinessProfile(slug: string) {
    const business = await requireBookableBusiness(slug);
    // Solo i campi pensati per essere pubblici — mai esporre ownerId o altri dettagli interni.
    return {
      name: business.name,
      slug: business.slug,
      description: business.description,
      category: business.category,
      email: business.email,
      phone: business.phone,
      address: business.address,
      city: business.city,
      country: business.country,
      timezone: business.timezone,
      logoUrl: business.logoUrl,
    };
  },

  async listServices(slug: string) {
    const business = await requireBookableBusiness(slug);
    return publicBookingRepository.listActiveServices(business.id);
  },

  async getSlots(slug: string, date: string, serviceId: string) {
    const business = await requireBookableBusiness(slug);
    const service = await publicBookingRepository.findActiveService(business.id, serviceId);
    if (!service) throw new NotFoundError("Service");

    const slots = await getAvailableSlotsForDate({
      tenantId: business.id,
      timezone: business.timezone,
      date,
      durationMinutes: service.durationMinutes,
    });
    return slots;
  },

  async createAppointment(slug: string, input: PublicCreateAppointmentInput) {
    const business = await requireBookableBusiness(slug);

    // Find-or-create riutilizzabile (customers.service.ts) — la STESSA funzione
    // che userà domani l'agente WhatsApp: nessuna logica di matching cliente
    // duplicata tra i due canali (sezione 9 e 11 dell'architettura).
    const { customer } = await customersService.findOrCreateCustomer(business.id, input.customer);

    // Riusa ESATTAMENTE la stessa logica di creazione (doppio controllo anti-overlap
    // applicativo + exclusion constraint) usata dall'endpoint autenticato in Fase 6 —
    // nessuna logica di prenotazione duplicata tra flusso pubblico e privato.
    return appointmentsService.create(
      business.id,
      {
        serviceId: input.serviceId,
        customerId: customer.id,
        startAt: input.startAt,
        notes: input.notes,
      },
      input.source as AppointmentSource
    );
  },

  async cancelAppointment(slug: string, appointmentId: string, input: PublicCancelAppointmentInput) {
    const business = await requireBookableBusiness(slug);
    const appointment = await publicBookingRepository.findAppointmentForCustomerVerification(
      business.id,
      appointmentId
    );
    if (!appointment) throw new NotFoundError("Appointment");

    // Verifica che chi cancella conosca email o telefono associati alla prenotazione —
    // un controllo minimo ma sufficiente per evitare che chiunque conoscendo solo
    // l'ID possa cancellare l'appuntamento di un altro cliente. Il telefono si
    // confronta normalizzato, così "333 123 4567" e "+393331234567" combaciano.
    const inputNormalizedPhone = input.phone ? normalizePhoneToE164(input.phone) : null;
    const matches =
      (input.email && appointment.customer.email === input.email) ||
      (inputNormalizedPhone && appointment.customer.normalizedPhone === inputNormalizedPhone);
    if (!matches) {
      throw new ForbiddenError("The provided email or phone does not match this appointment.");
    }

    if (appointment.status === "CANCELLED") return;

    const hoursUntilStart = (appointment.startAt.getTime() - Date.now()) / (60 * 60 * 1000);
    if (hoursUntilStart < env.PUBLIC_CANCELLATION_MIN_HOURS) {
      throw new ValidationError(
        `Appointments can only be cancelled at least ${env.PUBLIC_CANCELLATION_MIN_HOURS} hours in advance. Please contact the business directly.`
      );
    }

    await appointmentsService.cancelAsCustomer(business.id, appointmentId);
  },
};
