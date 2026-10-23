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

export const INDIAN_PHONE_REGEX = /^(?:(?:\+?91|0)?[6-9]\d{9})$/;

export const placeOrderInputSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
  items: z
    .array(orderItemInputSchema)
    .min(1, "At least one item is required in the order")
    .max(30, "Order cannot contain more than 30 items")
    .refine(
      (items) => items.reduce((sum, item) => sum + item.quantity, 0) <= 30,
      {
        message: "Order cannot contain more than 30 total items",
      }
    ),
  paymentMethod: z.enum(["pay_now", "counter"]).default("pay_now"),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val || val.length === 0) return true;
        const cleaned = val.replace(/[\s-]/g, "");
        return INDIAN_PHONE_REGEX.test(cleaned);
      },
      {
        message:
          "Please enter a valid 10-digit Indian phone number (e.g., 9876543210 or +91 98765 43210)",
      }
    )
    .optional()
    .nullable(),
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

export const confirmSimulatedPaymentSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export type ConfirmSimulatedPaymentInput = z.infer<
  typeof confirmSimulatedPaymentSchema
>;

export const createUpiQrSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export const paymentStatusSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export const verifyTestUpiPaymentSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export type CreateUpiQrInput = z.infer<typeof createUpiQrSchema>;
export type PaymentStatusInput = z.infer<typeof paymentStatusSchema>;
export type VerifyTestUpiPaymentInput = z.infer<typeof verifyTestUpiPaymentSchema>;


export const placeTabRoundSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
  items: z
    .array(orderItemInputSchema)
    .min(1, "At least one item is required in the order")
    .max(30, "Order cannot contain more than 30 items")
    .refine(
      (items) => items.reduce((sum, item) => sum + item.quantity, 0) <= 30,
      {
        message: "Order cannot contain more than 30 total items",
      }
    ),
  notes: z
    .string()
    .trim()
    .max(500, "Notes cannot exceed 500 characters")
    .optional()
    .nullable(),
  customerName: z.string().trim().max(100).optional().nullable(),
  customerPhone: z
    .string()
    .trim()
    .refine(
      (val) => {
        if (!val || val.length === 0) return true;
        const cleaned = val.replace(/[\s-]/g, "");
        return INDIAN_PHONE_REGEX.test(cleaned);
      },
      {
        message:
          "Please enter a valid 10-digit Indian phone number (e.g., 9876543210 or +91 98765 43210)",
      }
    )
    .optional()
    .nullable(),
});

export type PlaceTabRoundInput = z.infer<typeof placeTabRoundSchema>;

export const requestTabBillSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
  paymentMethod: z.enum(["pay_now", "counter"]).default("pay_now"),
});

export type RequestTabBillInput = z.infer<typeof requestTabBillSchema>;

export const verifyTabPaymentSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
  razorpayOrderId: z.string().trim().min(1, "Razorpay Order ID is required"),
  razorpayPaymentId: z.string().trim().min(1, "Razorpay Payment ID is required"),
  razorpaySignature: z.string().trim().min(1, "Razorpay Signature is required"),
});

export type VerifyTabPaymentInput = z.infer<typeof verifyTabPaymentSchema>;

export const testVerifyTabPaymentSchema = z.object({
  token: z.string().trim().min(1, "Table token is required"),
});

export type TestVerifyTabPaymentInput = z.infer<typeof testVerifyTabPaymentSchema>;

export const settleTabInputSchema = z.object({
  tabId: z.string().trim().min(1, "Tab ID is required"),
  paymentMethod: z.enum(["counter", "cash", "card", "upi"]).default("counter"),
  notes: z.string().trim().max(250).optional().nullable(),
});

export type SettleTabInput = z.infer<typeof settleTabInputSchema>;
