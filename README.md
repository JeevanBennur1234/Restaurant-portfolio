# DinePulse — Fine Dining Mobile Ordering & KDS

> Concept preview by [Intallo](https://intallo.in), a web & automation agency in Bengaluru.

**DinePulse** is an end-to-end demo restaurant ordering system designed for **Masala Lane** (a fictional warm, editorial, regional Indian casual dining restaurant in Bengaluru).

Built mobile-first for guests with zero app installation required, coupled with a high-contrast dark Kitchen Display System (KDS), online Razorpay payments, and an executive Manager Admin hub.

---

## 🛠️ Stack & Architecture

- **Framework**: Next.js 16 (App Router with Turbopack)
- **Frontend**: React 19, Tailwind CSS, Lucide Icons, next/font
- **Data & ORM**: PostgreSQL with Drizzle ORM (with in-memory fallback for offline/demo evaluation)
- **Validation**: Strict Zod schemas on all Server Actions & Route Handlers
- **Payments**: Razorpay test mode with server-side signature verification & webhook idempotency
- **Realtime**: Supabase Realtime WebSocket broadcast with polling fallback
- **Printables**: High-resolution PDF table standee cards via `pdfkit` & `qrcode`
- **Currency**: INR (Indian Rupee), strictly stored and computed server-side in integer paise

---

## 🚀 How to Run Locally

### Prerequisites
- Node.js 18.18+ or 20+
- npm or pnpm

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/JeevanBennur1234/Restaurant-portfolio.git
cd Restaurant-portfolio
npm install
```

### 2. Configure Environment Variables

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

The app has built-in resilient mock fallbacks for Razorpay, Supabase, and PostgreSQL, so it runs immediately out of the box even without live external services.

### 3. (Optional) Database Setup with PostgreSQL

If you have a local PostgreSQL instance running:

```bash
# Push Drizzle schema to database
npm run db:push

# Seed Masala Lane restaurant, 12 tables, 6 categories, 30 items, and staff accounts
npm run db:seed
```

*(Note: If PostgreSQL is offline, the app seamlessly falls back to its seeded in-memory store so all features work interactively).*

### 4. Start the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📱 Portals & Demo Routes

| Route | Role / Persona | Description | Demo Credentials |
|---|---|---|---|
| `/` | Public | Masala Lane landing page & concept overview | None |
| `/demo` | Public | Interactive launcher to test Guest, Kitchen, and Admin | None |
| `/t/demo` | Guest Dining | Mobile-first guest ordering at Table 7. Sticky category tabs, veg filters, item modifiers, bottom-sheet cart, and UPI/Counter checkout. | No login required |
| `/t/[token]/order/[id]` | Guest Tracker | Live order status stepper (Placed → Preparing → Ready → Served) with realtime updates & "Order more" button. | No login required |
| `/kitchen` | Kitchen Chef / Staff | Dark high-contrast KDS board with New / Preparing / Ready columns, urgent audio chime, and timer urgency color coding (amber @ 10m, red @ 15m). | `kitchen` / `kitchen123` |
| `/admin` | Floor Manager / Admin | Full manager hub: server-paginated live orders with audit-logged cancellation, menu catalog & modifier CRUD, one-click stock toggle, table manager with printable PDF QR standees, and 7-day revenue analytics. | `manager` / `manager123` |
| `/api/admin/tables/qr-pdf` | Manager / Admin | Generates printable A4 table tent cards with high-res QR codes pointing directly to each table's guest ordering URL. | Manager session required |

---

## 🧪 Verification Commands

```bash
# Typecheck TypeScript strictly
npm run typecheck

# Lint with ESLint
npm run lint

# Production Turbopack build
npm run build
```

---

## 📄 License & Credits

Concept preview by **Intallo** ([intallo.in](https://intallo.in)).
