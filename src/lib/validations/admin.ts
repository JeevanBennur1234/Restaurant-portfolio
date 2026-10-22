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

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif", ".svg", ".gif"];
const KNOWN_IMAGE_HOSTS = [
  "images.unsplash.com",
  "plus.unsplash.com",
  "res.cloudinary.com",
  "images.pexels.com",
  "img.freepik.com",
];

export function isValidImageUrl(urlStr: string): { valid: boolean; error?: string } {
  if (!urlStr || urlStr.trim() === "") return { valid: true };
  const trimmed = urlStr.trim();

  // Local / relative paths starting with /
  if (trimmed.startsWith("/")) {
    const lower = trimmed.toLowerCase();
    const hasExt = IMAGE_EXTENSIONS.some((ext) => lower.split("?")[0].endsWith(ext));
    if (hasExt || lower.startsWith("/images/") || lower.startsWith("/uploads/") || lower.startsWith("/media/")) {
      return { valid: true };
    }
    return {
      valid: false,
      error: "Local image path must start with /images/, /uploads/, or /media/, or end with a valid image extension.",
    };
  }

  // Absolute URLs must be http:// or https://
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return {
      valid: false,
      error: "Image URL must be a valid http(s) URL or a relative path starting with /.",
    };
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // Reject common webpage extensions (HTML, PHP, etc.)
    if (
      pathname.endsWith(".html") ||
      pathname.endsWith(".htm") ||
      pathname.endsWith(".php") ||
      pathname.endsWith(".asp") ||
      pathname.endsWith(".aspx") ||
      pathname.endsWith(".jsp")
    ) {
      return {
        valid: false,
        error: "The provided URL is a webpage, not an image file.",
      };
    }

    // Check if hostname is an allowed remote host matching next.config.ts
    const isKnownHost =
      KNOWN_IMAGE_HOSTS.includes(hostname) ||
      hostname.endsWith(".supabase.co") ||
      Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          (() => {
            try {
              return hostname === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase();
            } catch {
              return false;
            }
          })()
      );

    if (!isKnownHost) {
      return {
        valid: false,
        error: `Unsupported remote image host or image format "${hostname}". Remote images must be hosted on an allowed provider (Unsplash, Pexels, Cloudinary, Freepik, Supabase). To use this photo, please upload the image file or use a local path under /images/, /uploads/, or /media/.`,
      };
    }

    if (pathname.length <= 1) {
      return {
        valid: false,
        error: "Image URL must specify a path to an image file or resource.",
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format." };
  }
}

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
  imageUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .superRefine((val, ctx) => {
      if (!val) return;
      const res = isValidImageUrl(val);
      if (!res.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error ?? "Invalid image URL",
        });
      }
    }),
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
  imageUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .superRefine((val, ctx) => {
      if (!val) return;
      const res = isValidImageUrl(val);
      if (!res.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error ?? "Invalid image URL",
        });
      }
    }),
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

/**
 * Counter payment recording schema
 */
export const recordCounterPaymentSchema = z.object({
  paymentMethod: z.enum(["cash", "card", "upi"], {
    message: "Payment method must be cash, card, or upi",
  }),
  transactionRef: z.string().trim().max(100).optional(),
  note: z.string().trim().max(255).optional(),
});

export type RecordCounterPaymentInput = z.infer<typeof recordCounterPaymentSchema>;

