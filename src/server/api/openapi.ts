import { z } from "zod";
import { placeOrderInputSchema } from "@/lib/validations/order";
import {
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  createModifierSchema,
  updateModifierSchema,
  createTableSchema,
  updateTableSchema,
  adminOrdersQuerySchema,
} from "@/lib/validations/admin";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

const transitionSchema = z.object({
  toStatus: z.enum([
    "placed",
    "accepted",
    "preparing",
    "ready",
    "served",
    "cancelled",
  ]),
});

const cancelOrderBodySchema = z.object({
  reason: z.string().trim().min(3, "Reason must be at least 3 characters"),
});

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
});

const verifyPaymentBodySchema = z.object({
  razorpayOrderId: z.string().trim().min(1),
  razorpayPaymentId: z.string().trim().min(1),
  razorpaySignature: z.string().trim().min(1),
});

export function generateOpenApiDocument() {
  const envelopeSuccessRef = {
    $ref: "#/components/schemas/EnvelopeSuccess",
  };
  const envelopeErrorRef = {
    $ref: "#/components/schemas/EnvelopeError",
  };

  const standardResponses = {
    "400": {
      description: "Validation error or invalid request",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "401": {
      description: "Unauthenticated request",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "403": {
      description: "Forbidden / Insufficient permissions or invalid origin",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "404": {
      description: "Resource not found",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "409": {
      description: "Conflict / Idempotency mismatch",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "429": {
      description: "Rate limited",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
    "500": {
      description: "Internal server error",
      content: { "application/json": { schema: envelopeErrorRef } },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: "DinePulse REST API",
      version: "1.0.0",
      description:
        "High-performance REST API for DinePulse restaurant ordering, kitchen dispatch, and admin management.",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "dinepulse_staff_session",
          description: "Staff session cookie",
        },
        tableToken: {
          type: "apiKey",
          in: "header",
          name: "x-table-token",
          description: "Table QR token header for customer ordering and payments",
        },
      },
      schemas: {
        EnvelopeSuccess: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: { type: "object" },
          },
          required: ["success", "data"],
        },
        EnvelopeError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  enum: [
                    "VALIDATION",
                    "UNAUTHENTICATED",
                    "FORBIDDEN",
                    "NOT_FOUND",
                    "CONFLICT",
                    "RATE_LIMITED",
                    "PAYMENT",
                    "INTERNAL",
                  ],
                },
                message: { type: "string" },
              },
              required: ["code", "message"],
            },
          },
          required: ["success", "error"],
        },
        LoginInput: z.toJSONSchema(loginSchema),
        PlaceOrderInput: z.toJSONSchema(placeOrderInputSchema),
        VerifyPaymentInput: z.toJSONSchema(verifyPaymentBodySchema),
        TransitionInput: z.toJSONSchema(transitionSchema),
        CancelOrderInput: z.toJSONSchema(cancelOrderBodySchema),
        CreateCategoryInput: z.toJSONSchema(createCategorySchema),
        UpdateCategoryInput: z.toJSONSchema(updateCategorySchema),
        CreateMenuItemInput: z.toJSONSchema(createMenuItemSchema),
        UpdateMenuItemInput: z.toJSONSchema(updateMenuItemSchema),
        AvailabilityInput: z.toJSONSchema(availabilitySchema),
        CreateModifierInput: z.toJSONSchema(createModifierSchema),
        UpdateModifierInput: z.toJSONSchema(updateModifierSchema),
        CreateTableInput: z.toJSONSchema(createTableSchema),
        UpdateTableInput: z.toJSONSchema(updateTableSchema),
        AdminOrdersQuery: z.toJSONSchema(adminOrdersQuerySchema),
      },
    },
    paths: {
      "/api/v1/health": {
        get: {
          summary: "System health probe",
          responses: {
            "200": {
              description: "System healthy",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/openapi.json": {
        get: {
          summary: "OpenAPI specification",
          responses: {
            "200": { description: "OpenAPI 3.0 document" },
          },
        },
      },
      "/api/v1/auth/login": {
        post: {
          summary: "Staff authentication",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Session established",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/auth/logout": {
        post: {
          summary: "Staff logout",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Session cleared",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/auth/me": {
        get: {
          summary: "Current staff member profile",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Current actor",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/tables/{token}/menu": {
        get: {
          summary: "Guest menu for table",
          parameters: [
            {
              name: "token",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Active menu categories and items",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/tables/{token}/orders": {
        post: {
          summary: "Place guest order",
          parameters: [
            {
              name: "token",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "Idempotency-Key",
              in: "header",
              required: false,
              schema: { type: "string", minLength: 8, maxLength: 128 },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PlaceOrderInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Order placed successfully",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/orders/{id}": {
        get: {
          summary: "Guest order status details",
          security: [{ tableToken: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Order details",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/orders/{id}/payment/razorpay": {
        post: {
          summary: "Create Razorpay payment order",
          security: [{ tableToken: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Razorpay order initialized",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/orders/{id}/payment/verify": {
        post: {
          summary: "Verify Razorpay payment signature",
          security: [{ tableToken: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifyPaymentInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Payment verified successfully",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/orders/{id}/payment/counter": {
        post: {
          summary: "Switch order payment to pay-at-counter",
          security: [{ tableToken: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Order switched to counter payment",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/customer/orders/{id}/payment/simulate": {
        post: {
          summary: "Simulate payment confirmation (demo mode only)",
          security: [{ tableToken: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Simulated payment accepted",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/kitchen/tickets": {
        get: {
          summary: "List active kitchen tickets",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Active kitchen tickets",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/kitchen/orders/{id}/transition": {
        post: {
          summary: "Advance ticket order status",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TransitionInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Order transitioned",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/orders": {
        get: {
          summary: "List admin orders with pagination and filtering",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Paginated orders",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/orders/{id}/cancel": {
        post: {
          summary: "Cancel order with reason",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CancelOrderInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Order cancelled",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/categories": {
        get: {
          summary: "List menu categories",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Categories list",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        post: {
          summary: "Create menu category",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateCategoryInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Category created",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/categories/{id}": {
        patch: {
          summary: "Update category",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateCategoryInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Category updated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        delete: {
          summary: "Delete category",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Category deleted",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/items": {
        get: {
          summary: "List menu items",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Menu items list",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        post: {
          summary: "Create menu item",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateMenuItemInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Menu item created",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/items/{id}": {
        patch: {
          summary: "Update menu item",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateMenuItemInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Menu item updated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        delete: {
          summary: "Delete menu item",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Menu item deleted",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/items/{id}/availability": {
        post: {
          summary: "Toggle item 86/sold-out status",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AvailabilityInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Item availability updated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/items/{id}/modifiers": {
        get: {
          summary: "List modifiers for menu item",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Modifiers list",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        post: {
          summary: "Add modifier to menu item",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateModifierInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Modifier created",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/items/{id}/modifiers/{modifierId}": {
        patch: {
          summary: "Update modifier",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "modifierId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateModifierInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Modifier updated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        delete: {
          summary: "Delete modifier",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "modifierId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Modifier deleted",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/tables": {
        get: {
          summary: "List dining tables",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Tables list",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        post: {
          summary: "Create dining table",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateTableInput" },
              },
            },
          },
          responses: {
            "201": {
              description: "Table created",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/tables/{id}": {
        patch: {
          summary: "Update dining table",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateTableInput" },
              },
            },
          },
          responses: {
            "200": {
              description: "Table updated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
        delete: {
          summary: "Deactivate dining table",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Table deactivated",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/tables/qr.pdf": {
        get: {
          summary: "Export table QR code standees as printable PDF",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Generated PDF document",
              content: { "application/pdf": {} },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/reports": {
        get: {
          summary: "Aggregated manager KPIs, top dishes and 7-day revenue analytics",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Executive report metrics",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
      "/api/v1/admin/uploads": {
        post: {
          summary: "Upload image to Supabase Storage",
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    file: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Uploaded image URL",
              content: { "application/json": { schema: envelopeSuccessRef } },
            },
            ...standardResponses,
          },
        },
      },
    },
  };
}
