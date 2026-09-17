import { z } from "zod";

export const checkoutSchema = z.object({
  plan: z.enum(["PRO", "BUSINESS"]),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
