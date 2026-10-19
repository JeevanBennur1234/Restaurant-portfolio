# DinePulse — Multi-Site Restaurant Ordering & Kitchen Operations System

> Concept preview and engineering showcase by [Intallo](https://www.intallo.in), a bespoke web application and digital automation agency in Bengaluru.

**DinePulse** is a production-minded restaurant ordering, kitchen display, and management platform designed for **Masala Lane**, a contemporary Indian dining concept. Engineered from a single unified codebase, DinePulse delivers three distinct surfaces: a zero-install mobile ordering experience for diners, a high-contrast dark Kitchen Display System (KDS) for culinary staff, and an executive management console for floor leadership.

---

## Visual Showcase

| Guest Mobile Menu (Phone) | Kitchen Display Board (Tablet) | Manager Live Console (Desktop) |
|:---:|:---:|:---:|
| ![DinePulse Customer Menu](docs/screenshots/customer-menu.webp) | ![DinePulse Kitchen KDS Board](docs/screenshots/kitchen-board.webp) | ![DinePulse Manager Live Orders](docs/screenshots/manager-orders.webp) |

*For complete visual walkthroughs and technical specifications, explore the [Portfolio Case Study](docs/CASE-STUDY.md) and [System Architecture](docs/ARCHITECTURE.md).*

---

## Three Sites, One Codebase

DinePulse runs three tailored web experiences from a single Next.js 16 App Router codebase. The application personality is established at runtime by the `SITE` environment variable, while the request proxy router ([`src/proxy.ts`](src/proxy.ts)) enforces strict perimeter isolation across domains.

| Site | Primary Audience | Key Route Scope | Role Authorization | Local Port |
|---|---|---|---|:---:|
| **Customer** | Guest Diners | `/`, `/demo`, `/t/:token`, `/t/:token/order/:id`, `/api/v1/customer/*` | Public (Ephemeral table QR tokens) | `http://localhost:3000` |
| **Kitchen** | Expeditors & Kitchen Staff | `/kitchen`, `/demo-enter`, `/api/v1/kitchen/*`, `/api/v1/auth/*` | `kitchen`, `manager`, `admin` | `http://localhost:3001` |
| **Manager** | Restaurant Managers & Admins | `/admin`, `/demo-enter`, `/api/v1/admin/*`, `/api/admin/*`, `/api/v1/auth/*` | `manager`, `admin` | `http://localhost:3002` |

---

## Features by Site

### 1. Customer Dining Surface (`:3000`)
- **Instant Table QR Access**: Diners scan a table QR code to open their dedicated menu without app downloads or account registration.
- **Dietary Badging & Modifiers**: Clear Vegetarian / Non-Veg indicators with nested modifier options (e.g., marinations, spice levels, dips).
- **Cart & Subtotal Breakdown**: Live cart sheet with 5% Goods and Services Tax (GST) calculated server-side in integer paise.
- **Flexible Checkout**: Supports simulated/live Razorpay online payments or "Pay at Counter".
- **Live Order Tracker**: Real-time status milestones (`placed` → `accepted` → `preparing` → `ready` → `served`) with automatic 5-second polling fallback.

### 2. Kitchen Display System (`:3001`)
- **Station-Ready Contrast**: Dark-themed, high-contrast ticket cards designed for kitchen tablets under ambient heat and glare.
- **Chronological Ticket Ingestion**: Instant ticket arrival via Supabase Realtime broadcast with audio chimes.
- **Sequential Ticket Actions**: Enforces the valid transition state machine (`Start Prep` → `Mark Ready` → `Served`).
- **Clock-Skew Compensated Timers**: Live elapsed timers counting up accurately even if server and station clocks deviate.
- **Ambient Wake Lock**: Requests a screen wake lock where the browser supports it, so tablets are less likely to sleep during a shift.

### 3. Manager Administration Console (`:3002`)
- **Live Orders Module**: Real-time floor overview across all active tables with audit-enforced cancellation reasons.
- **Menu Catalog Editor**: Create and modify categories, menu dishes, prices, and availability toggles on the fly.
- **Table QR Code Generator**: Dynamic table creation and instant generation of high-resolution, printable A4 table standee sheets with vector `%PDF` output.
- **Sales & Operations Reports**: Today's Gross Sales, Net Revenue, Tax distributions, average ticket sizes, and category volume breakdowns.

---

## Architecture Summary

DinePulse separates concerns across three logical layers:

```
Clients (Guest Phone / Kitchen Tablet / Manager Desktop)
   │
   ▼
Request Proxy Router (src/proxy.ts)  ──>  Strict Site Route Allowlisting & 404 Rejection
   │
   ▼
REST API v1 (/api/v1/*)            ──>  Typed Envelope, Request ID, Idempotency-Key
   │
   ▼
Domain Service Layer               ──>  customer.ts, kitchen.ts, manager.ts, demo.ts
   │
   ▼
PostgreSQL Database (Drizzle ORM)  <──  Single Source of Truth (Integer Paise, GST)
   │
   ├─► Supabase Realtime Broadcast ──>  Ephemeral WebSocket notifications (restaurant:hmac)
   └─► Supabase Storage            ──>  Public dish photography bucket (menu-images)
```

- **Perimeter Security**: Staff routes return genuine 404 responses when requested on the customer domain.
- **Atomic Idempotency**: A repeated order submission with the same Idempotency-Key returns the original order instead of creating a second one. Payments are protected separately by signature and amount verification.
- **Financial Precision**: All monetary values are calculated and stored exclusively as integer paise (`₹1.00 = 100 paise`).
- **Dual-Channel Resilience**: Realtime WebSocket notifications are treated as hints, backed by an automated 5-second polling fallback.

*For complete system context diagrams, order sequence charts, and authentication isolation flows, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).*

---

## API Summary

DinePulse exposes a structured, typed REST API under `/api/v1/` documented interactively at `/api/v1/openapi.json`:

- **Envelope Contract**: Every response returns a standardized JSON envelope:
  - Success: `{ "success": true, "data": { ... } }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "...", "requestId": "..." } }`
- **Customer Endpoints**: Menu catalog fetching, table verification, order placement (`POST /api/v1/customer/orders`), and live order status.
- **Kitchen Endpoints**: Active ticket listings (`GET /api/v1/kitchen/orders`) and ticket status advancement (`POST /api/v1/kitchen/orders/:id/transition`).
- **Admin Endpoints**: Order management, catalog CRUD, table management, QR PDF streaming (`GET /api/v1/admin/tables/qr.pdf`), and analytics summaries.
- **Staff Auth Endpoints**: Secure session login (`POST /api/v1/auth/login`), demo entry (`POST /api/v1/auth/demo-login`), and session verification (`GET /api/v1/auth/me`).

*For endpoint parameters, schemas, and error codes, refer to [`docs/API.md`](docs/API.md).*

---

## Quick Start

### Prerequisites
- **Node.js**: v22.0.0 or higher
- **npm**: v10.0.0 or higher
- **PostgreSQL**: Version 16 (Local Docker container or local PostgreSQL service)

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/JeevanBennur1234/Restaurant-portfolio.git
cd Restaurant-portfolio
npm install
```

### 2. Configure Local Environment
Copy the example environment file:
```bash
cp .env.example .env.local
```

Ensure `.env.local` contains a valid local database connection and session secret:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dinepulse"
SESSION_SECRET="your-secure-random-session-secret-at-least-32-chars-long"
PAYMENTS_MODE="online"
```

### 3. Initialize & Seed Database
Apply version-controlled database migrations and seed sample menu dishes, tables, and staff users:
```bash
# Apply schema migrations
npm run db:migrate

# Seed restaurant, tables, categories, 30 dishes, and demo staff
npm run db:seed
```

### 4. Start All Three Sites
Launch the customer, kitchen, and manager sites concurrently on distinct local ports:
```bash
npm run dev:sites
```

- **Customer Site**: [http://localhost:3000](http://localhost:3000) (Guest ordering at `/t/demo-table-7` or showcase at `/demo`)
- **Kitchen Site**: [http://localhost:3001](http://localhost:3001) (KDS board at `/kitchen`)
- **Manager Site**: [http://localhost:3002](http://localhost:3002) (Admin console at `/admin`)

---

## Environment Variables Reference

DinePulse validates all environment variables on boot using Zod in [`src/server/env.ts`](src/server/env.ts).

| Variable | Required | Default / Scope | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | Direct / Pooler | PostgreSQL connection string. |
| `SESSION_SECRET` | **Yes** | Min 32 chars | Secret key for signing staff HMAC session tokens and deriving private realtime channels. |
| `NEXT_PUBLIC_APP_URL` | **Yes** | e.g. `http://localhost:3000` | Canonical public URL for the running site instance. |
| `SITE` | Conditional | `customer` \| `kitchen` \| `manager` \| `all` | Controls site personality and proxy routing rules. |
| `PAYMENTS_MODE` | No | `online` | Payment gateway mode (`online` or `counter_only`). |
| `NEXT_PUBLIC_CUSTOMER_SITE_URL` | If Multi-site | e.g. `http://localhost:3000` | Cross-site navigation link to customer portal. |
| `NEXT_PUBLIC_KITCHEN_SITE_URL` | If Multi-site | e.g. `http://localhost:3001` | Cross-site navigation link to kitchen portal. |
| `NEXT_PUBLIC_MANAGER_SITE_URL` | If Multi-site | e.g. `http://localhost:3002` | Cross-site navigation link to manager console. |
| `FRAME_ANCESTORS` | Optional | Origin URL | CSP `frame-ancestors` directive for iframe embedding. |
| `RAZORPAY_KEY_ID` | Production | `rzp_live_*` | Razorpay Key ID (required on customer/all in production when PAYMENTS_MODE=online). |
| `RAZORPAY_KEY_SECRET` | Production | Secret | Razorpay Key Secret (required on customer/all in production when PAYMENTS_MODE=online). |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Secret | Razorpay Webhook HMAC secret for webhook signature verification. |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase Host | Supabase project URL for Realtime broadcasts and storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | JWT Anon Key | Supabase anon key for browser client subscriptions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | JWT Service Key | Supabase service role key for server-side broadcast and image uploads. |

---

## Testing & Quality Assurance

DinePulse maintains a comprehensive testing pyramid combining static analysis, unit/integration testing, link checking, and full browser end-to-end automation.

```bash
# Run unit and integration tests (306 passing tests across 33 test files)
npm test

# Run TypeScript strict typecheck
npm run typecheck

# Run ESLint validation
npm run lint

# Validate all relative documentation links and heading anchors
npm run check-links

# Execute Playwright browser end-to-end suite across all three sites
npx cross-env E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dinepulse_e2e" npm run e2e

# Capture clean, optimized WebP portfolio screenshots automatically
npx cross-env E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dinepulse_e2e" npm run screenshots

# Validate production Next.js compilation
npm run build
```

> **Crucial Database Safety Guard**: Destructive end-to-end tests (`npm run e2e`) and automated screenshot capture (`npm run screenshots`) wipe and re-seed database state. They strictly require an explicit `E2E_DATABASE_URL` pointing to a disposable local PostgreSQL database (`localhost` or CI container). Both suites automatically refuse execution if the database host contains `supabase` or points to an unverified remote instance.

*For complete testing documentation and spec coverage, see [`docs/TESTING.md`](docs/TESTING.md).*

---

## Production Deployment

DinePulse deploys to Vercel as three independent projects from the same repository root:
1. **Customer Project**: `SITE=customer`, build command `npm run build:customer`.
2. **Kitchen Project**: `SITE=kitchen`, build command `npm run build:kitchen`.
3. **Manager Project**: `SITE=manager`, build command `npm run build:manager`.

### Database Pooling Strategy
- **Application Runtime**: Configure `DATABASE_URL` pointing to Supabase's transaction pooler (port `6543`). The application does not use named prepared statements, ensuring seamless compatibility with transaction poolers.
- **Database Migrations (`npm run db:migrate`)**: Run migrations pointing to the direct session pooler (port `5432`) to execute DDL operations safely.
- **Shared Secret Rule**: All three projects must share the exact same `SESSION_SECRET`. Realtime broadcast channel names are derived via HMAC-SHA256 from this secret; mismatched secrets silently disconnect live updates between customer, kitchen, and manager.

*For full deployment checklists and custom domain configurations, see the [Deployment Guide](docs/DEPLOY.md).*

---

## Local Development & Testing Credentials Notice

When running locally with seeded data:
- Seeded kitchen staff account: Username `kitchen` / Password `kitchen123`
- Seeded manager account: Username `manager` / Password `manager123`

> **Security Warning**: These credentials are strictly intended for local development and automated end-to-end testing. Never use or recommend these passwords in a staging or production deployment. In production, create secure manager accounts via `npm run admin:create-manager` with strong, randomly generated passwords.

---

## Food Photography & Media Assets

DinePulse features an editorial dining visual style with high-resolution food photography. Food photos and video assets should be placed in `public/images/` and `public/media/`:

### File Locations & Naming Conventions
- **Hero Background**: Drop `public/images/hero.jpg` (or video `public/media/hero.mp4` + poster `public/media/hero-poster.jpg`).
- **Heritage Story**: Drop `public/images/story.jpg`.
- **Seeded Dish Photos**: Drop into `public/images/dishes/<slug>.jpg` named by dish slug:
  - `butter-chicken.jpg` (Old Delhi Butter Chicken)
  - `paneer-tikka.jpg` (Paneer Tikka Shashlik)
  - `dal-makhani.jpg` (Dal Makhani 24-Hour Simmer)
  - `gosht-dum-biryani.jpg` (Gosht Dum Biryani)
  - `truffle-cheddar-naan.jpg` (Truffle & Aged Cheddar Naan)
  - *(See full list by running `npm run check-images`)*

### Recommended Sizes & Compression
- **Hero Image**: **2400px wide** (e.g. 2400×1350, 16:9 aspect ratio).
- **Story Image**: **1200×900px** (4:3 aspect ratio).
- **Dish Photos**: **1200×900px** (4:3 aspect ratio).
- **Strict Compression**: Every image must be compressed under **250KB** each (using modern tools like Squoosh, TinyPNG, or ImageOptim). Next.js automatically serves optimized `image/avif` and `image/webp` to supported browsers.

### Image Audit Script
To verify which referenced food photos are currently present or missing on disk:
```bash
npm run check-images
```

### Graceful Fallbacks (Zero Layout Shift)
When custom photography is pending:
- The app automatically renders tasteful warm-toned gradient SVG placeholders with fixed aspect ratios (`hero-placeholder.svg`, `story-placeholder.svg`, `dish-placeholder.svg`).
- The guest menu card and detail sheet feature an error boundary fallback (`onError`) to prevent layout shifts or broken image badges if a file is missing.

---

## Built by Intallo

DinePulse is an architectural concept and engineering showcase created by **Intallo**.

Intallo crafts bespoke web applications, high-performance digital platforms, and operational automations.

- **Website**: [https://www.intallo.in](https://www.intallo.in)
- **Inquiries**: [hello@intallo.in](mailto:hello@intallo.in)
