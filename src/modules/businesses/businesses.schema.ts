import { z } from "zod";

export const updateBusinessSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(2000).optional(),
  category: z.string().max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).max(30).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().max(100).optional(),
  timezone: z.string().max(100).optional(),
  logoUrl: z.string().url().optional(),
});
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
