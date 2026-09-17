import { z } from "zod";

export const createAppointmentSchema = z.object({
  serviceId: z.string().uuid(),
  customerId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }), // ISO 8601 con offset esplicito
  notes: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z.object({
  startAt: z.string().datetime({ offset: true }).optional(), // reschedule
  notes: z.string().max(2000).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"]).optional(),
  // La cancellazione ha un endpoint dedicato (DELETE) per poter tracciare
  // cancelledAt/cancelledBy in modo esplicito — non è ammessa via questo status.
});
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

export const listAppointmentsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]).optional(),
  source: z.enum(["WEBSITE", "WHATSAPP", "ADMIN"]).optional(),
  customerId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

export const appointmentIdParamsSchema = z.object({ id: z.string().uuid() });
