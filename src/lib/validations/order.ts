import { z } from "zod";

export const orderItemInputSchema = z.object({
  menuItemId: z.string().trim().min(1, "Menu item ID is required"),
  quantity: z
    .number()
    .int()
    .min(1, "Quantity must be at least 1")
    .max(50, "Quantity cannot exceed 50"),
  selectedModifierIds: z.array(z.string().trim()).default([]),
});

export const placeOrderInputSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
  items: z
    .array(orderItemInputSchema)
    .min(1, "At least one item is required in the order"),
  paymentMethod: z.enum(["pay_now", "counter"]).default("pay_now"),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z.string().trim().max(20).optional().nullable(),
});

export const createRazorpayOrderSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export const verifyPaymentSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
  razorpayOrderId: z.string().trim().min(1, "Razorpay Order ID is required"),
  razorpayPaymentId: z.string().trim().min(1, "Razorpay Payment ID is required"),
  razorpaySignature: z.string().trim().min(1, "Razorpay Signature is required"),
});

export const switchPaymentMethodSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
  targetMethod: z.enum(["counter", "pay_now"]),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type PlaceOrderInput = z.infer<typeof placeOrderInputSchema>;
export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type SwitchPaymentMethodInput = z.infer<typeof switchPaymentMethodSchema>;

export const orderStatusParamSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});
