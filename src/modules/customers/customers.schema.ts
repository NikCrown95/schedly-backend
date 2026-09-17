import { z } from "zod";

export const createCustomerSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(30).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  // Ricerca libera su nome, cognome, email, telefono.
  search: z.string().max(150).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export const customerIdParamsSchema = z.object({ id: z.string().uuid() });
