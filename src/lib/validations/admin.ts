import { z } from "zod";

/**
 * Valid order status values
 */
export const orderStatusFilterSchema = z.enum([
  "all",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "served",
  "cancelled",
]);

export const paymentStatusFilterSchema = z.enum([
  "all",
  "pending",
  "paid",
  "counter",
  "failed",
]);

/**
 * Server-side order pagination & filtering query schema
 */
export const adminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  status: orderStatusFilterSchema.default("all"),
  paymentStatus: paymentStatusFilterSchema.default("all"),
  search: z.string().trim().optional(),
});

export type AdminOrdersQueryInput = z.input<typeof adminOrdersQuerySchema>;
export type AdminOrdersQueryOutput = z.infer<typeof adminOrdersQuerySchema>;

/**
 * Order cancellation schema
 */
export const cancelOrderSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  reason: z.string().trim().min(3, "Please provide a reason (at least 3 characters)"),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

/**
 * Category CRUD schemas
 */
export const createCategorySchema = z.object({
  name: z.string().trim().min(2, "Category name must be at least 2 characters"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  sortOrder: z.coerce.number().int().default(0),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: z.string().trim().min(1, "Category ID is required"),
  name: z.string().trim().min(2, "Category name must be at least 2 characters"),
  slug: z
    .string()
    .trim()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Slug must only contain lowercase letters, numbers, and hyphens"),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const deleteCategorySchema = z.object({
  id: z.string().trim().min(1, "Category ID is required"),
});

export type DeleteCategoryInput = z.infer<typeof deleteCategorySchema>;

/**
 * Menu Item CRUD schemas
 */
export const createMenuItemSchema = z.object({
  name: z.string().trim().min(2, "Item name must be at least 2 characters"),
  categoryId: z.string().trim().min(1, "Category is required"),
  priceRupees: z.coerce
    .number()
    .positive("Price must be greater than ₹0")
    .max(100000, "Price is too large"),
  isVeg: z.boolean().default(true),
  prepTimeMinutes: z.coerce
    .number()
    .int()
    .min(1, "Prep time must be at least 1 minute")
    .max(120, "Prep time cannot exceed 120 minutes")
    .default(15),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;

export const updateMenuItemSchema = z.object({
  id: z.string().trim().min(1, "Item ID is required"),
  name: z.string().trim().min(2, "Item name must be at least 2 characters"),
  categoryId: z.string().trim().min(1, "Category is required"),
  priceRupees: z.coerce
    .number()
    .positive("Price must be greater than ₹0")
    .max(100000, "Price is too large"),
  isVeg: z.boolean().default(true),
  prepTimeMinutes: z.coerce
    .number()
    .int()
    .min(1, "Prep time must be at least 1 minute")
    .max(120, "Prep time cannot exceed 120 minutes")
    .default(15),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().trim().optional().nullable(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;

export const toggleMenuItemAvailabilitySchema = z.object({
  id: z.string().trim().min(1, "Item ID is required"),
  isAvailable: z.boolean(),
});

export type ToggleMenuItemAvailabilityInput = z.infer<
  typeof toggleMenuItemAvailabilitySchema
>;

export const deleteMenuItemSchema = z.object({
  id: z.string().trim().min(1, "Item ID is required"),
});

export type DeleteMenuItemInput = z.infer<typeof deleteMenuItemSchema>;

/**
 * Modifier schemas
 */
export const createModifierSchema = z.object({
  menuItemId: z.string().trim().min(1, "Menu item ID is required"),
  groupName: z.string().trim().min(2, "Group name must be at least 2 characters"),
  name: z.string().trim().min(1, "Modifier name is required"),
  priceRupees: z.coerce
    .number()
    .min(0, "Price cannot be negative")
    .max(50000, "Price is too large")
    .default(0),
  isRequired: z.boolean().default(false),
});

export type CreateModifierInput = z.infer<typeof createModifierSchema>;

export const updateModifierSchema = z.object({
  groupName: z.string().trim().min(2, "Group name must be at least 2 characters").optional(),
  name: z.string().trim().min(1, "Modifier name is required").optional(),
  priceRupees: z.coerce
    .number()
    .min(0, "Price cannot be negative")
    .max(50000, "Price is too large")
    .optional(),
  isRequired: z.boolean().optional(),
});

export type UpdateModifierInput = z.infer<typeof updateModifierSchema>;

export const deleteModifierSchema = z.object({
  id: z.string().trim().min(1, "Modifier ID is required"),
});

export type DeleteModifierInput = z.infer<typeof deleteModifierSchema>;

/**
 * Table management schemas
 */
export const createTableSchema = z.object({
  tableNumber: z.string().trim().min(1, "Table number is required"),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be at least 1 seat")
    .max(30, "Capacity cannot exceed 30 seats")
    .default(4),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;

export const updateTableSchema = z.object({
  tableNumber: z.string().trim().min(1, "Table number is required").optional(),
  capacity: z.coerce
    .number()
    .int()
    .min(1, "Capacity must be at least 1 seat")
    .max(30, "Capacity cannot exceed 30 seats")
    .optional(),
  isActive: z.boolean().optional(),
});

export type UpdateTableInput = z.infer<typeof updateTableSchema>;

export const deleteTableSchema = z.object({
  id: z.string().trim().min(1, "Table ID is required"),
});

export type DeleteTableInput = z.infer<typeof deleteTableSchema>;

