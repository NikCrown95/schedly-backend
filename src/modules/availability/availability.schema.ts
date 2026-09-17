import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be in HH:mm format (24h).");

export const availabilityRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6), // 0 = domenica ... 6 = sabato
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((r) => r.startTime < r.endTime, {
    message: "startTime must be before endTime.",
    path: ["endTime"],
  });
export type AvailabilityRuleInput = z.infer<typeof availabilityRuleSchema>;

// PUT sostituisce l'INTERO orario settimanale ricorrente in un colpo solo —
// più semplice da ragionare lato frontend di un CRUD granulare per singola riga,
// ed è comunque un'operazione rara (il professionista lo imposta una volta e
// lo tocca raramente).
export const putAvailabilitySchema = z.object({
  rules: z.array(availabilityRuleSchema).max(50),
});
export type PutAvailabilityInput = z.infer<typeof putAvailabilitySchema>;

export const createExceptionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
    isClosed: z.boolean().default(true),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    reason: z.string().max(200).optional(),
  })
  .refine((e) => e.isClosed || (e.startTime && e.endTime), {
    message: "startTime and endTime are required when isClosed is false.",
    path: ["startTime"],
  })
  .refine((e) => !e.startTime || !e.endTime || e.startTime < e.endTime, {
    message: "startTime must be before endTime.",
    path: ["endTime"],
  });
export type CreateExceptionInput = z.infer<typeof createExceptionSchema>;

export const listExceptionsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ListExceptionsQuery = z.infer<typeof listExceptionsQuerySchema>;

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

export const exceptionIdParamsSchema = z.object({ id: z.string().uuid() });
