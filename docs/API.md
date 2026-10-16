# DinePulse REST API v1 Specification & Architecture

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

## Server Components Calling Services Directly

In accordance with Next.js App Router architecture:
- **Server Components** (such as `src/app/admin/page.tsx`, `src/app/kitchen/page.tsx`, `src/app/t/[token]/page.tsx`, `src/app/t/[token]/order/[orderId]/page.tsx`) call the framework-independent service layer directly in-process (`@/server/services/*`) passing `{ db, actor }` or `{ db, tableToken }`. They **do not** make HTTP requests to `/api/v1/`.
- **Client Components** (`src/components/guest/*`, `src/components/kitchen/*`, `src/components/admin/*`) interact with `/api/v1/` exclusively through the typed client (`@/lib/api`) using `customerApi`, `kitchenApi`, `adminApi`, and `authApi`.

---

## UI Call -> REST Endpoint Mapping

| UI Client Call | REST Endpoint | Method | Authentication & Guards | Description |
|---|---|---|---|---|
| `customerApi.getMenu(token)` | `/api/v1/customer/tables/:token/menu` | `GET` | Public (Table Token `:token`) | Fetches menu items, categories, and table info |
| `customerApi.placeOrder(token, payload)` | `/api/v1/customer/tables/:token/orders` | `POST` | Table Token (`:token`), Idempotency-Key | Atomically places guest table order |
| `customerApi.getOrder(orderId, token)` | `/api/v1/customer/orders/:id` | `GET` | `x-table-token` Header | Fetches order status, items, and events |
| `customerApi.createRazorpayOrder(data)` | `/api/v1/customer/orders/:id/payment/razorpay` | `POST` | `x-table-token` Header | Initializes Razorpay payment order |
| `customerApi.verifyRazorpayPayment(data)` | `/api/v1/customer/orders/:id/payment/verify` | `POST` | `x-table-token` Header | Validates HMAC-SHA256 Razorpay signature |
| `customerApi.payAtCounter(data)` | `/api/v1/customer/orders/:id/payment/counter` | `POST` | `x-table-token` Header | Switches pending order to pay-at-counter |
| `customerApi.simulatePayment(data)` | `/api/v1/customer/orders/:id/payment/simulate` | `POST` | `x-table-token` Header (DEMO_MODE) | Confirms demo test payment |
| `authApi.login(username, password)` | `/api/v1/auth/login` | `POST` | Public (Rate-limited, Anti-timing) | Issues secure HTTP-only session cookie |
| `authApi.logout()` | `/api/v1/auth/logout` | `POST` | Cookie, Origin Check | Invalidates and clears session cookie |
| `authApi.me()` | `/api/v1/auth/me` | `GET` | Staff Cookie (`getStaffSession`) | Returns authenticated staff session profile |
| `kitchenApi.listTickets()` | `/api/v1/kitchen/tickets` | `GET` | Staff Cookie (`kitchen`, `manager`, `admin`) | Lists active tickets needing kitchen prep |
| `kitchenApi.transitionStatus(id, status)` | `/api/v1/kitchen/orders/:id/transition` | `POST` | Staff Cookie (`kitchen`, `manager`, `admin`), Origin | Advances order status along state machine |
| `adminApi.listOrders(query)` | `/api/v1/admin/orders` | `GET` | Staff Cookie (`manager`, `admin`) | Paginated admin orders list with filters |
| `adminApi.cancelOrder(id, reason)` | `/api/v1/admin/orders/:id/cancel` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Cancels order and records audit note |
| `adminApi.listCategories()` | `/api/v1/admin/categories` | `GET` | Staff Cookie (`manager`, `admin`) | Retrieves menu categories |
| `adminApi.createCategory(data)` | `/api/v1/admin/categories` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates new menu category |
| `adminApi.updateCategory(id, data)` | `/api/v1/admin/categories/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates category details |
| `adminApi.deleteCategory(id)` | `/api/v1/admin/categories/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deactivates menu category |
| `adminApi.listItems()` | `/api/v1/admin/items` | `GET` | Staff Cookie (`manager`, `admin`) | Retrieves menu items |
| `adminApi.createItem(data)` | `/api/v1/admin/items` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates menu item |
| `adminApi.updateItem(id, data)` | `/api/v1/admin/items/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates menu item |
| `adminApi.setItemAvailability(id, avail)` | `/api/v1/admin/items/:id/availability` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Toggles 86 / sold out state |
| `adminApi.deleteItem(id)` | `/api/v1/admin/items/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Soft-deletes menu item |
| `adminApi.listModifiers(itemId)` | `/api/v1/admin/items/:id/modifiers` | `GET` | Staff Cookie (`manager`, `admin`) | Lists modifiers for item |
| `adminApi.createModifier(itemId, data)` | `/api/v1/admin/items/:id/modifiers` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Adds modifier to item |
| `adminApi.updateModifier(itemId, modId, data)` | `/api/v1/admin/items/:id/modifiers/:modifierId` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates modifier |
| `adminApi.deleteModifier(itemId, modId)` | `/api/v1/admin/items/:id/modifiers/:modifierId` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deletes modifier |
| `adminApi.listTables()` | `/api/v1/admin/tables` | `GET` | Staff Cookie (`manager`, `admin`) | Lists dining tables |
| `adminApi.createTable(data)` | `/api/v1/admin/tables` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Creates dining table |
| `adminApi.updateTable(id, data)` | `/api/v1/admin/tables/:id` | `PATCH` | Staff Cookie (`manager`, `admin`), Origin | Updates table attributes |
| `adminApi.deleteTable(id)` | `/api/v1/admin/tables/:id` | `DELETE` | Staff Cookie (`manager`, `admin`), Origin | Deactivates table |
| `adminApi.qrPdfUrl()` | `/api/v1/admin/tables/qr.pdf` | `GET` | Staff Cookie (`manager`, `admin`) | Generates printable QR PDF standees |
| `adminApi.getReports()` | `/api/v1/admin/reports` | `GET` | Staff Cookie (`manager`, `admin`) | Analytics KPIs, top items, 7-day revenue |
| `adminApi.uploadImage(file)` | `/api/v1/admin/uploads` | `POST` | Staff Cookie (`manager`, `admin`), Origin | Uploads image to Supabase Storage via `apiUpload` |
| `authApi.demoLogin(role)` | `/api/v1/auth/demo-login` | `POST` | Demo mode gated (`DEMO_MODE=true`), site role gate | Authenticates demo staff user without credentials |
| `customerApi.advanceOrder({ orderId, token })` | `/api/v1/customer/orders/:id/demo/advance` | `POST` | Demo mode gated, Table Token (`x-table-token`) | Advances order status in demo simulation |
| — | `/demo-enter` | `GET` | Demo mode gated, Kitchen & Manager sites only | Sets session cookie and redirects to `/kitchen` or `/admin` |
| — | `/api/v1/health` | `GET` | Public | Probes DB connection with `SELECT 1` |
| — | `/api/v1/openapi.json` | `GET` | Public (Cached 5 min) | OpenAPI 3.0 specification |

---

## Unchanged Specialized Endpoints

The following non-v1 routes are preserved without changes:
- `POST /api/webhooks/razorpay`: Razorpay cryptographic webhook handler.
- `POST /api/demo/reset`: Secret-authorized demo dataset reset.
