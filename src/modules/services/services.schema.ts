import { z } from "zod";

export const createServiceSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(24 * 60),
  // Prezzo sempre in centesimi (intero) per evitare problemi di floating point.
  priceCents: z.number().int().min(0),
  currency: z.string().length(3).default("EUR"),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

export const serviceIdParamsSchema = z.object({
  id: z.string().uuid(),
});
