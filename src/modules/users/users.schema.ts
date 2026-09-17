import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().min(5).max(30).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
