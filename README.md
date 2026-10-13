# DinePulse — Fine Dining Mobile Ordering & KDS

> Concept preview by [Intallo](https://intallo.in), a web & automation agency in Bengaluru.

**DinePulse** is an end-to-end restaurant ordering system designed for **Masala Lane** (a fictional warm, editorial, regional Indian casual dining restaurant in Bengaluru).

Built mobile-first for guests with zero app installation required, coupled with a high-contrast dark Kitchen Display System (KDS), online Razorpay payments, and an executive Manager Admin hub.

---

## 🛠️ Stack & Architecture

- **Framework**: Next.js 16 (App Router with Turbopack)
- **Frontend**: React 19, Tailwind CSS, Lucide Icons, next/font
- **Data & ORM**: PostgreSQL with Drizzle ORM (**PostgreSQL is the single source of truth**; no in-memory fallbacks)
- **Validation**: Strict Zod schemas on all Server Actions & Route Handlers
- **Payments**: Razorpay payments with server-side HMAC-SHA256 signature verification, webhook idempotency, and gated demo simulation
- **Realtime**: Supabase Realtime WebSocket broadcast with server-side channel HMAC derivation and polling fallback
- **Printables**: High-resolution PDF table standee cards via `pdfkit` & `qrcode`
- **Currency**: INR (Indian Rupee), strictly stored and computed server-side in integer paise with 5% GST

---

## ⚙️ Environment Variables

DinePulse validates environment variables at startup via `src/server/env.ts` using Zod.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (direct or pooled). |
| `NEXT_PUBLIC_APP_URL` | Yes | Public application URL (e.g. `http://localhost:3000` or `https://dinepulse.example.com`). |
| `SESSION_SECRET` | Yes | Secret key for staff session cookies. Must be at least 32 characters in production (generate via `openssl rand -base64 48`). |
| `DEMO_MODE` | No | `"true"` or `"false"` (default: `"false"`). Controls demo behaviors and safeguards. |
| `DEMO_RESET_SECRET` | If resetting | Bearer token required to call `GET`/`POST /api/demo/reset`. |
| `CRON_SECRET` | Vercel Cron | Secret matched against Vercel Cron Bearer token for automated reset. |
| `SEED_KITCHEN_PASSWORD` | Optional | Custom password for the seeded kitchen user. Randomly generated if omitted outside demo mode. |
| `SEED_MANAGER_PASSWORD` | Optional | Custom password for the seeded manager user. Randomly generated if omitted outside demo mode. |
| `RAZORPAY_KEY_ID` | Production | Razorpay API Key ID (required in production unless `DEMO_MODE="true"`). |
| `RAZORPAY_KEY_SECRET` | Production | Razorpay Key Secret (required in production unless `DEMO_MODE="true"`). |
| `RAZORPAY_WEBHOOK_SECRET` | Production | Razorpay Webhook Secret (never falls back to key secret). |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Supabase Project URL for Realtime updates and storage. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Supabase Anon Key for browser subscriptions. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Supabase Service Role Key for server-side broadcasts and image storage. |

---

## 🎮 DEMO_MODE Explanation

When `DEMO_MODE="true"`:
- **Interactive Showcase**: Enables the interactive split-screen demo at `/demo` with one-click "Open as Kitchen" and "Open as Manager" buttons (`demoLoginAction`).
- **Simulated Payments**: Allows placing and confirming test orders without live Razorpay credentials when placeholder keys are detected.
- **Guest Step Simulation**: Enables the "Simulate Kitchen Step" button on the guest tracker (`/t/[token]/order/[id]`), allowing guests to step through valid statuses sequentially without opening a second window.
- **Demo Guardrails**: Seeded demo accounts are marked with `isDemo: true`. Demo managers are restricted: they cannot delete tables, categories, or items; cannot upload images; and cannot cancel paid orders.
- **Automated Reset**: Enables the `POST /api/demo/reset` endpoint to purge test orders and re-seed demo data.
- **Fixed Table Token**: Table 7 is seeded with the predictable QR token `demo-table-7`.

When `DEMO_MODE="false"` (Production):
- All demo actions, bypasses, and simulation buttons are strictly disabled on the server.
- Real Razorpay keys are enforced without placeholders.
- `SESSION_SECRET` must be at least 32 characters and cannot match default values.

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js 20+
- npm 10+
- PostgreSQL database instance (local Docker or Supabase)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/JeevanBennur1234/Restaurant-portfolio.git
cd Restaurant-portfolio
npm install
```

### 2. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env.local
```

Set a secure `SESSION_SECRET`:
```bash
openssl rand -base64 48
```

For local testing with demo capabilities, set `DEMO_MODE=true` in `.env.local`.

#### Local PostgreSQL via Docker Compose
Start the included PostgreSQL 16 container:
```bash
docker compose up -d
```
Connection string:
```env
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/dinepulse
```

### 3. Database Migrations & Seed

Apply version-controlled SQL migrations from `./drizzle` and seed demo data:

```bash
# 1. Generate migrations (after modifying schema)
npm run db:generate

# 2. Apply migrations to the PostgreSQL database
npm run db:migrate

# 3. Seed restaurant, tables, categories, 30 items, and staff users
npm run db:seed

# 4. (Optional) Migrate legacy base64 images to Supabase Storage
npm run db:migrate-images
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing & Verification

Run the comprehensive test suite with Vitest:

```bash
# Run unit & security test suite
npm test

# Typecheck TypeScript strictly
npm run typecheck

# Lint with ESLint
npm run lint

# Production build check
npm run build
```

The test suite covers:
- Money and 5% GST integer paise calculation & currency formatting
- Strict order status transitions (`VALID_TRANSITIONS`)
- Razorpay payment verification binding & amount mismatch protection
- Simulated payment gating (`DEMO_MODE="true"`)
- Staff session token expiry, HMAC-SHA256 tampering prevention, and timing-safe checks
- Postgres-backed rate limiting for login attempts and order placement
- Sequential per-restaurant order number generation (`ML-0001`)

---

## 📸 Food Photography & Media Assets

DinePulse is built around an editorial, photography-led dining experience for **Masala Lane**. Food photos and videos should be placed in `public/images/` and `public/media/`:

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
- **Strict Compression**: Every image **must be compressed under 250KB each** (using modern tools like Squoosh, TinyPNG, or ImageOptim). Next.js automatically serves optimized `image/avif` and `image/webp` to supported browsers.

### Image Audit Script
To verify which referenced food photos are currently present or missing on disk:

```bash
npm run check-images
```

### Graceful Fallbacks (Zero Layout Shift)
Until custom food photos are added:
- The app automatically renders tasteful warm-toned gradient SVG placeholders with fixed aspect ratios (`hero-placeholder.svg`, `story-placeholder.svg`, `dish-placeholder.svg`).
- The guest menu card and detail sheet feature an error boundary fallback (`onError`) to prevent layout shifts or broken image badges if a file is missing.

---

## 🌐 Portals & Routes

| Route | Role / Persona | Description |
|---|---|---|
| `/` | Public | Masala Lane landing page, story, and concept overview. |
| `/demo` | Public Showcase | Interactive showcase with split-screen preview and one-click role launchers. |
| `/t/demo-table-7` | Guest Dining | Mobile-first guest ordering for Table 7 with category tabs, veg toggle, modifiers, and cart. |
| `/t/[token]/order/[id]` | Guest Tracker | Live order status tracker (`placed` → `accepted` → `preparing` → `ready` → `served`). |
| `/kitchen` | Kitchen Staff | Dark high-contrast KDS board with live audio alerts and ticket timers. |
| `/admin` | Restaurant Manager | Live order management, menu editor, table manager with QR PDF export, and sales analytics. |
| `/api/admin/tables/qr-pdf` | Admin | Generates printable A4 table standee cards with high-resolution QR codes. |
| `/api/demo/reset` | Maintenance | Reset endpoint protected by `DEMO_RESET_SECRET` for cron jobs. |

---

## ☁️ Vercel Deployment

### Deploying to Vercel

1. Push your repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. Set the following environment variables in **Project Settings → Environment Variables**:
   - `DATABASE_URL`: Hosted PostgreSQL connection string (e.g. Supabase pooler).
   - `NEXT_PUBLIC_APP_URL`: Your Vercel production URL (e.g. `https://dinepulse.vercel.app`).
   - `SESSION_SECRET`: Random 48-byte string (`openssl rand -base64 48`).
   - `DEMO_MODE`: Set to `"true"` for demo deployments or `"false"` for production.
   - `DEMO_RESET_SECRET`: Random secret string for the demo reset endpoint.
   - `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. Run migrations against your production database:
   ```bash
   DATABASE_URL="<production-url>" npm run db:migrate
   DATABASE_URL="<production-url>" npm run db:seed
   ```
5. Deploy.

### Demo Reset Setup

Demo reset runs from GitHub Actions (demo-reset.yml). Set the repo secrets DEMO_RESET_URL (https://<customer-site>/api/demo/reset) and DEMO_RESET_SECRET.

---

## 📄 License & Credits

Concept preview by **Intallo** ([intallo.in](https://intallo.in)) — bespoke web applications & automations.
