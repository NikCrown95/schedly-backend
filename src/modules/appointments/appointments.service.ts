import { Prisma, AppointmentSource } from "@prisma/client";
import { DateTime } from "luxon";
import { prisma } from "@shared/lib/prisma.js";
import {
  NotFoundError,
  ValidationError,
  AppointmentNotAvailableError,
} from "@shared/lib/errors.js";
import { isWithinOpenHours } from "@modules/availability/availability.engine.js";
import { sendNotification } from "@modules/notifications/notifications.service.js";
import { appointmentsRepository } from "./appointments.repository.js";
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  ListAppointmentsQuery,
} from "./appointments.schema.js";

// Riconosce una violazione della exclusion constraint Postgres (SQLSTATE 23P01)
// sollevata dalla `appointments_no_overlap` — la seconda linea di difesa contro
// le race condition, oltre al controllo applicativo fatto prima della create.
function isOverlapConstraintViolation(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as { code?: string; message?: string } | undefined;
    return (
      meta?.code === "23P01" ||
      (typeof meta?.message === "string" && meta.message.includes("appointments_no_overlap"))
    );
  }
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return err.message.includes("23P01") || err.message.includes("appointments_no_overlap");
  }
  return false;
}

async function validateAndPrepare(
  tenantId: string,
  serviceId: string,
  customerId: string,
  startAtRaw: string
) {
  const [business, service, customer] = await Promise.all([
    prisma.business.findUnique({ where: { id: tenantId } }),
    prisma.service.findFirst({ where: { id: serviceId, businessId: tenantId, active: true } }),
    prisma.customer.findFirst({ where: { id: customerId, businessId: tenantId } }),
  ]);

  if (!business) throw new NotFoundError("Business");
  if (!service) throw new NotFoundError("Service");
  if (!customer) throw new NotFoundError("Customer");

  const startAt = new Date(startAtRaw);
  if (Number.isNaN(startAt.getTime())) {
    throw new ValidationError("Invalid startAt date.");
  }
  const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);

  const withinHours = await isWithinOpenHours(tenantId, business.timezone, startAt, endAt);
  if (!withinHours) {
    throw new ValidationError("The selected time is outside business hours.");
  }

  return { business, service, customer, startAt, endAt };
}

function formatLocal(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date, { zone: "utc" })
    .setZone(timezone)
    .toFormat("cccc d LLLL yyyy 'at' HH:mm");
}

export const appointmentsService = {
  list(tenantId: string, query: ListAppointmentsQuery) {
    return appointmentsRepository.list(tenantId, query);
  },

  async getById(tenantId: string, id: string) {
    const appointment = await appointmentsRepository.findById(tenantId, id);
    if (!appointment) throw new NotFoundError("Appointment");
    return appointment;
  },

  async create(tenantId: string, input: CreateAppointmentInput, source: AppointmentSource) {
    const { business, service, customer, startAt, endAt } = await validateAndPrepare(
      tenantId,
      input.serviceId,
      input.customerId,
      input.startAt
    );

    // Prima linea di difesa: ricontrollo applicativo, dentro una transazione
    // per ridurre la finestra di race condition rispetto al momento in cui il
    // frontend ha richiesto lo slot.
    try {
      const appointment = await prisma.$transaction(async (tx) => {
        const overlapping = await tx.appointment.findFirst({
          where: {
            businessId: tenantId,
            staffMemberId: null,
            status: { notIn: ["CANCELLED"] },
            startAt: { lt: endAt },
            endAt: { gt: startAt },
          },
        });
        if (overlapping) {
          throw new AppointmentNotAvailableError();
        }

        return tx.appointment.create({
          data: {
            businessId: tenantId,
            serviceId: service.id,
            customerId: customer.id,
            startAt,
            endAt,
            status: "CONFIRMED",
            source,
            // Snapshot: prezzo e durata del servizio COSÌ COM'ERANO al momento
            // della prenotazione. Non vengono più letti dal Service in futuro,
            // proprio per non alterare retroattivamente l'incasso storico se il
            // titolare cambia prezzo o durata del servizio in seguito.
            priceCents: service.priceCents,
            durationMinutes: service.durationMinutes,
            notes: input.notes,
          },
          include: { service: true, customer: true },
        });
      });

      await sendNotification({
        businessId: tenantId,
        channel: "EMAIL",
        eventType: "appointment.created",
        recipient: customer.email ?? customer.phone ?? "unknown",
        payload: {
          appointmentId: appointment.id,
          businessName: business.name,
          serviceName: service.name,
          customerName: customer.firstName,
          formattedStart: formatLocal(appointment.startAt, business.timezone),
        },
      });

      return appointment;
    } catch (err) {
      // Seconda linea di difesa: la exclusion constraint DB ha rifiutato l'insert
      // nonostante il controllo applicativo (vera race condition concorrente).
      if (isOverlapConstraintViolation(err)) {
        throw new AppointmentNotAvailableError();
      }
      throw err;
    }
  },

  async update(tenantId: string, id: string, input: UpdateAppointmentInput) {
    const existing = await appointmentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Appointment");
    if (existing.status === "CANCELLED") {
      throw new ValidationError("Cannot modify a cancelled appointment.");
    }

    let startAt = existing.startAt;
    let endAt = existing.endAt;

    // Reschedule: ricalcola endAt dalla durata SNAPSHOT dell'appuntamento (non
    // dalla durata corrente del servizio, che potrebbe essere cambiata da
    // allora) e rivalida tutto.
    if (input.startAt) {
      const business = await prisma.business.findUnique({ where: { id: tenantId } });
      if (!business) throw new NotFoundError("Business");

      startAt = new Date(input.startAt);
      if (Number.isNaN(startAt.getTime())) throw new ValidationError("Invalid startAt date.");
      endAt = new Date(startAt.getTime() + existing.durationMinutes * 60_000);

      const withinHours = await isWithinOpenHours(tenantId, business.timezone, startAt, endAt);
      if (!withinHours) {
        throw new ValidationError("The selected time is outside business hours.");
      }

      const overlapping = await appointmentsRepository.findOverlapping(
        tenantId,
        existing.staffMemberId,
        startAt,
        endAt,
        existing.id
      );
      if (overlapping) throw new AppointmentNotAvailableError();
    }

    try {
      await appointmentsRepository.update(tenantId, id, {
        ...(input.startAt ? { startAt, endAt } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status ? { status: input.status } : {}),
      });
    } catch (err) {
      if (isOverlapConstraintViolation(err)) throw new AppointmentNotAvailableError();
      throw err;
    }

    return appointmentsRepository.findById(tenantId, id);
  },

  // Cancellazione lato business: nessuna finestra temporale minima nell'MVP —
  // il professionista può sempre cancellare un proprio appuntamento. La finestra
  // di cancellazione configurabile lato cliente ("fino a 24h prima") verrà
  // applicata solo all'endpoint pubblico in Fase 7, dove ha senso come regola
  // di prodotto verso i clienti finali.
  async cancel(tenantId: string, id: string) {
    return this.cancelInternal(tenantId, id, "business");
  },

  // Usata dal flusso di prenotazione pubblica (Fase 7) dopo aver verificato
  // l'identità del cliente e la finestra minima di cancellazione.
  async cancelAsCustomer(tenantId: string, id: string) {
    return this.cancelInternal(tenantId, id, "customer");
  },

  async cancelInternal(tenantId: string, id: string, cancelledBy: "business" | "customer") {
    const existing = await appointmentsRepository.findById(tenantId, id);
    if (!existing) throw new NotFoundError("Appointment");
    if (existing.status === "CANCELLED") return;

    await appointmentsRepository.cancel(tenantId, id, cancelledBy);

    const business = await prisma.business.findUnique({ where: { id: tenantId } });

    await sendNotification({
      businessId: tenantId,
      channel: "EMAIL",
      eventType: "appointment.cancelled",
      recipient: existing.customer.email ?? existing.customer.phone ?? "unknown",
      payload: {
        appointmentId: id,
        cancelledBy,
        businessName: business?.name,
        serviceName: existing.service.name,
        customerName: existing.customer.firstName,
        formattedStart: business ? formatLocal(existing.startAt, business.timezone) : undefined,
      },
    });
  },
};
