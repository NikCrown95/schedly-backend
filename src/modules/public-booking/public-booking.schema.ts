import { z } from "zod";

export const slugParamsSchema = z.object({
  slug: z.string().min(1).max(150),
});

export const publicSlotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid(),
});
export type PublicSlotsQuery = z.infer<typeof publicSlotsQuerySchema>;

export const publicCreateAppointmentSchema = z
  .object({
    serviceId: z.string().uuid(),
    startAt: z.string().datetime({ offset: true }),
    notes: z.string().max(1000).optional(),
    // Di norma "WEBSITE" (il cliente prenota dalla pagina pubblica). Un futuro
    // agente WhatsApp che crea la prenotazione per conto del cliente userà
    // questo stesso endpoint passando "WHATSAPP" — "ADMIN" non è ammesso qui,
    // è riservato all'endpoint autenticato lato titolare.
    source: z.enum(["WEBSITE", "WHATSAPP"]).default("WEBSITE"),
    customer: z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().max(100).optional(),
      email: z.string().email().optional(),
      phone: z.string().min(5).max(30).optional(),
    }),
  })
  .refine((v) => v.customer.email || v.customer.phone, {
    message: "Either email or phone is required.",
    path: ["customer"],
  });
export type PublicCreateAppointmentInput = z.infer<typeof publicCreateAppointmentSchema>;

export const publicCancelAppointmentSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(5).max(30).optional(),
  })
  .refine((v) => v.email || v.phone, {
    message: "Either email or phone is required to verify the cancellation.",
  });
export type PublicCancelAppointmentInput = z.infer<typeof publicCancelAppointmentSchema>;

export const appointmentIdParamsSchema = z.object({
  slug: z.string().min(1).max(150),
  id: z.string().uuid(),
});
