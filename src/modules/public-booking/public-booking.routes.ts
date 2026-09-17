import type { FastifyInstance } from "fastify";
import {
  slugParamsSchema,
  publicSlotsQuerySchema,
  publicCreateAppointmentSchema,
  publicCancelAppointmentSchema,
  appointmentIdParamsSchema,
} from "./public-booking.schema.js";
import { publicBookingService } from "./public-booking.service.js";

// Rate limit dedicato: più permissivo delle rotte di auth per la navigazione
// (business/servizi/slot), ma la creazione di un appuntamento ha un limite a parte,
// ancora più stringente, perché è l'endpoint con il maggior potenziale di abuso/spam
// (sezione 11 e 23 dell'architettura).
const publicBrowseRateLimit = {
  config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
};
const publicWriteRateLimit = {
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
};

export async function publicBookingRoutes(app: FastifyInstance) {
  app.get("/:slug", publicBrowseRateLimit, async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params);
    const business = await publicBookingService.getBusinessProfile(slug);
    return reply.send(business);
  });

  app.get("/:slug/services", publicBrowseRateLimit, async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params);
    const services = await publicBookingService.listServices(slug);
    return reply.send(services);
  });

  app.get("/:slug/availability", publicBrowseRateLimit, async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params);
    const query = publicSlotsQuerySchema.parse(request.query);
    const slots = await publicBookingService.getSlots(slug, query.date, query.serviceId);
    return reply.send({ date: query.date, slots });
  });

  app.post("/:slug/appointments", publicWriteRateLimit, async (request, reply) => {
    const { slug } = slugParamsSchema.parse(request.params);
    const input = publicCreateAppointmentSchema.parse(request.body);
    const appointment = await publicBookingService.createAppointment(slug, input);
    return reply.status(201).send(appointment);
  });

  app.post(
    "/:slug/appointments/:id/cancel",
    publicWriteRateLimit,
    async (request, reply) => {
      const { slug, id } = appointmentIdParamsSchema.parse(request.params);
      const input = publicCancelAppointmentSchema.parse(request.body);
      await publicBookingService.cancelAppointment(slug, id, input);
      return reply.status(204).send();
    }
  );
}
