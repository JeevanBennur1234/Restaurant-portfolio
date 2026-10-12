import { z } from "zod";

/**
 * QR token validation schema for guest table access
 */
export const tokenParamSchema = z
  .string()
  .trim()
  .min(3, "Invalid QR token length")
  .max(64, "QR token is too long")
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid QR token format");

/**
 * Cart item client schema (stores IDs, quantity, and modifier IDs only)
 */
export const cartItemSchema = z.object({
  id: z.string().min(1),
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  selectedModifierIds: z.array(z.string()),
});

export const cartStateSchema = z.array(cartItemSchema);

export type ValidatedCartItem = z.infer<typeof cartItemSchema>;
