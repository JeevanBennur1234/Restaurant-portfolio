# DinePulse REST API v1 Specification & Action Mapping

## Overview

DinePulse provides a versioned REST API under `/api/v1/` backed by a framework-independent service layer (`src/server/services/`).

### Global Conventions

- **Response Envelopes**:
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "..." } }`
- **Cache-Control**: `Cache-Control: no-store` on all mutating and real-time endpoints.
- **Request ID Tracking**: Every response includes `x-request-id: <uuid>` for distributed tracing.
- **Security & CSRF Protection**: Cookie-authenticated write requests (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `Origin` header matching the host or `ALLOWED_ORIGINS`. Requests with invalid or missing Origin headers return `403 FORBIDDEN`.
- **Idempotency**: `POST /api/v1/customer/tables/:token/orders` accepts an optional `Idempotency-Key` header (8–128 characters) providing atomic replay and duplicate order prevention.

---

## Server Action to REST Endpoint Mapping

| Server Action | REST Endpoint | Method | Authentication & Guards | Description |
|---|---|---|---|---|
| `placeOrderAction` | `/api/v1/customer/tables/:token/orders` | `POST` | Table Token (`:token`), Idempotency-Key | Atomically places guest table order |
| `getOrderDetailsAction` | `/api/v1/customer/orders/:id` | `GET` | `x-table-token` Header | Fetches order status, items, and events |
| `createRazorpayOrderAction` | `/api/v1/customer/orders/:id/payment/razorpay` | `POST` | `x-table-token` Header | Initializes Razorpay payment order |
| `verifyRazorpayPaymentAction` | `/api/v1/customer/orders/:id/payment/verify` | `POST` | `x-table-token` Header | Validates HMAC-SHA256 Razorpay signature |
| `switchOrderToCounterAction` | `/api/v1/customer/orders/:id/payment/counter` | `POST` | `x-table-token` Header | Switches pending order to pay-at-counter |
| `confirmSimulatedPaymentAction` | `/api/v1/customer/orders/:id/payment/simulate` | `POST` | `x-table-token` Header (DEMO_MODE) | Confirms demo test payment |
| `loginStaffAction` / `demoLoginAction` | `/api/v1/auth/login` | `POST` | Public (Rate-limited, Anti-timing) | Issues secure HTTP-only session cookie |
| `logoutStaffAction` | `/api/v1/auth/logout` | `POST` | Cookie, Origin Check | Invalidates and clears session cookie |
| — | `/api/v1/auth/me` | `GET` | Staff Cookie (`getStaffSession`) | Returns authenticated staff session profile |
| `getKitchenTicketsAction` | `/api/v1/kitchen/tickets` | `GET` | Staff Cookie (`kitchen`, `manager`, `admin`) | Lists active tickets needing kitchen prep |
| `transitionOrderStatusAction` / `simulateKitchenStepAction` | `/api/v1/kitchen/orders/:id/transition` | `POST` | Staff Cookie (`kitchen`, `manager`, `admin`), Origin | Advances order status along state machine |
| `getAdminOrdersAction` | `/api/v1/admin/orders` | `GET` | Staff Cookie (`manager`, `admin`) | Paginated admin orders list with filters |
| `cancelOrderAction` | `/api/v1/admin/orders/:id/cancel` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Cancels order and records audit note |
| `getAdminMenuAction` (categories) | `/api/v1/admin/categories` | `GET` | Staff Cookie (`manager`, `admin`) | Retrieves menu categories |
| `createCategoryAction` | `/api/v1/admin/categories` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates new menu category |
| `updateCategoryAction` | `/api/v1/admin/categories/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates category details |
| `deleteCategoryAction` | `/api/v1/admin/categories/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deactivates menu category |
| `getAdminMenuAction` (items) | `/api/v1/admin/items` | `GET` | Staff Cookie (`manager`, `admin`) | Retrieves menu items |
| `createMenuItemAction` | `/api/v1/admin/items` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates menu item |
| `updateMenuItemAction` | `/api/v1/admin/items/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates menu item |
| `toggleMenuItemAvailabilityAction` | `/api/v1/admin/items/:id/availability` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Toggles 86 / sold out state |
| `deleteMenuItemAction` | `/api/v1/admin/items/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Soft-deletes menu item |
| — | `/api/v1/admin/items/:id/modifiers` | `GET` | Staff Cookie (`manager`, `admin`) | Lists modifiers for item |
| `createModifierAction` | `/api/v1/admin/items/:id/modifiers` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Adds modifier to item |
| — | `/api/v1/admin/items/:id/modifiers/:modifierId` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates modifier |
| `deleteModifierAction` | `/api/v1/admin/items/:id/modifiers/:modifierId` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deletes modifier |
| `getAdminTablesAction` | `/api/v1/admin/tables` | `GET` | Staff Cookie (`manager`, `admin`) | Lists dining tables |
| `createTableAction` | `/api/v1/admin/tables` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates dining table |
| — | `/api/v1/admin/tables/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates table attributes |
| `deleteTableAction` | `/api/v1/admin/tables/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deactivates table |
| — | `/api/v1/admin/tables/qr.pdf` | `GET` | Staff Cookie (`manager`, `admin`) | Generates printable QR PDF standees |
| `getAdminReportsAction` | `/api/v1/admin/reports` | `GET` | Staff Cookie (`manager`, `admin`) | Analytics KPIs, top dishes, 7-day revenue |
| — | `/api/v1/admin/uploads` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Uploads image to Supabase Storage |
| — | `/api/v1/health` | `GET` | Public | Probes DB connection with `SELECT 1` |
| — | `/api/v1/openapi.json` | `GET` | Public (Cached 5 min) | OpenAPI 3.0 specification |

---

## Unchanged Specialized Endpoints

The following non-v1 routes are preserved without changes:
- `POST /api/webhooks/razorpay`: Razorpay cryptographic webhook handler.
- `POST /api/demo/reset`: Secret-authorized demo dataset reset.
