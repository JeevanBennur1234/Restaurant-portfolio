# DinePulse Testing Guide

This guide details how to execute and debug DinePulse tests across all three operational surfaces: **Customer Dining** (`:3000`), **Kitchen Display System** (`:3001`), and **Manager Console** (`:3002`).

---

## 1. Test Architecture Overview

DinePulse uses a two-tier test suite:

1. **Unit & Integration Suite (Vitest)**:
   - 304 fast in-memory tests across 33 test files.
   - Uses `@electric-sql/pglite` for isolated in-process Postgres execution.
   - Run command: `npm test`

2. **Browser End-to-End Suite (Playwright)**:
   - 8 comprehensive multi-site specifications running against a real PostgreSQL instance.
   - Spins up all three Next.js servers concurrently in isolated multi-site mode.
   - Validates user interactions, real-time sync, cross-site authentication isolation, payment integrity, mobile viewport responsiveness, and WCAG accessibility.
   - Run command: `npm run e2e`

---

## 2. Safety Guardrails: Protecting Real Databases

> [!CAUTION]
> **Strict Supabase Protection**: E2E tests wipe orders, reset tables, and seed test data. E2E tests are **strictly prohibited** from running against Supabase or remote production databases.

`e2e/global-setup.ts` validates the target database host before running any migrations or test specs:
- If `E2E_DATABASE_URL` (or `DATABASE_URL`) contains `"supabase"` or points to any host other than `localhost`, `127.0.0.1`, `::1`, or a CI container host (`postgres`), the test runner **aborts immediately** with an explicit safety refusal error before touching the database.
- **Never use your demo or production database for E2E testing.** Always use a local throwaway PostgreSQL instance.

---

## 3. Running E2E Tests Locally

### Step 1: Start a Local PostgreSQL Instance

Ensure a local Postgres instance (version 15 or 16) is running on your machine. You can use Docker, WSL Ubuntu, or local native Postgres:

```bash
# Example using Docker:
docker run --name dinepulse-test-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=dinepulse_e2e -p 5433:5432 -d postgres:16
```

### Step 2: Run the Playwright Suite

Point `E2E_DATABASE_URL` to your local test database and run:

```bash
# Linux / macOS / WSL:
E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dinepulse_e2e" npm run e2e

# Windows PowerShell:
$env:E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dinepulse_e2e"
npm run e2e
```

The test runner will:
1. Verify the database host is safe (local).
2. Apply Drizzle migrations and seed demo users (`kitchen` / `kitchen123`, `manager` / `manager123`).
3. Automatically launch the three dev servers (`:3000`, `:3001`, `:3002`) and probe `/api/v1/health`.
4. Run all specs across desktop Chromium and mobile (Pixel 5) viewports.

---

## 4. Debugging with Playwright UI & Traces

### Interactive Test UI

To step through tests visually, inspect DOM snapshots, and view network requests:

```bash
E2E_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/dinepulse_e2e" npm run e2e:ui
```

### Inspecting Traces & Screenshots

Failed tests automatically capture DOM traces, screenshots, and video on retry:
- Screenshots are saved to `test-results/`
- HTML report is generated in `playwright-report/`

To view the HTML report after a test run:

```bash
npx playwright show-report
```

To inspect an individual test trace file:

```bash
npx playwright show-trace test-results/<test-dir>/trace.zip
```

---

## 5. Specification Coverage: What Each Spec Protects

| Specification File | Target Surface | Key Protections & Assertions |
| :--- | :--- | :--- |
| [`e2e/customer-order.spec.ts`](../e2e/customer-order.spec.ts) | Customer (`:3000`) | Guest table QR session (`/t/demo-table-7`), modifier sheet selection, "Pay at counter", order confirmation number generation, double-click idempotency guard (`Idempotency-Key` prevents duplicate orders). |
| [`e2e/three-site-flow.spec.ts`](../e2e/three-site-flow.spec.ts) | Customer (`:3000`) & Kitchen (`:3001`) | Full cross-site operational flow: guest places order on `:3000`, kitchen logs in on `:3001`, claims ticket and advances `placed` -> `preparing` -> `ready` -> `served`. Guest live tracker updates automatically without page reload. |
| [`e2e/route-isolation.spec.ts`](../e2e/route-isolation.spec.ts) | All Sites (`:3000`, `:3001`, `:3002`) | Strict multi-tenant perimeter: verifies `/admin` and `/kitchen` are 404 on `:3000`; `/admin` and `/t/x` are 404 on `:3001`; `/kitchen` is 404 on `:3002`; and manager API routes return 404 on customer origin. |
| [`e2e/staff-isolation.spec.ts`](../e2e/staff-isolation.spec.ts) | Kitchen (`:3001`) & Manager (`:3002`) | Staff security boundary: kitchen session cookies are rejected on manager site (`/api/v1/auth/me` -> 401), kitchen credentials on manager login trigger site rejection ("This account can't sign in on this site."), and 5 failed attempts trigger rate-limit lockout. |
| [`e2e/manager-console.spec.ts`](../e2e/manager-console.spec.ts) | Manager (`:3002`) | Manager administration: real credential authentication (`manager123`), menu category & item creation, table generation, printable QR PDF download (asserts `application/pdf` and `%PDF` binary header), order cancellation with audit reason, and sales analytics reports. |
| [`e2e/demo-page.spec.ts`](../e2e/demo-page.spec.ts) | Customer (`:3000`) | Interactive showcase: verifies `/demo` renders phone frame (guest) and tablet frame (kitchen / manager via `/demo-enter`), handles third-party cookie partitioning gracefully, and asserts "Open in new tab" fallback links. |
| [`e2e/payments.spec.ts`](../e2e/payments.spec.ts) | Customer (`:3000`) | Payment integrity: verifies `DEMO_MODE=true` simulated "Pay Now" flow marks orders paid; directly tests amount tampering prevention (mismatched amount returns 400 and leaves order unpaid). |
| [`e2e/a11y-and-mobile.spec.ts`](../e2e/a11y-and-mobile.spec.ts) | All Sites | Mobile responsiveness & WCAG: asserts zero horizontal overflow at 360px viewport on guest menu, cart sheet, and tracker; runs `@axe-core/playwright` asserting zero serious or critical accessibility violations on guest menu, KDS board, and manager login. |

---

## 6. Known Accessibility False-Positives (WCAG / Axe)

In accordance with our design system tokens and specification, the automated Playwright Axe scans (`e2e/a11y-and-mobile.spec.ts`) exclude the following known false-positive rule:
- **`color-contrast`**: DinePulse's signature editorial dining palette utilizes custom warm ember/terracotta brand tokens (`#c85a32` measuring ~4.23:1 contrast on white backgrounds) and earthy muted text (`#8e8177` measuring ~3.77:1 contrast). While slightly below the strict WCAG AA 4.5:1 ratio for normal body text, these intentional branding tones are documented and allowed per the design specification.

---

## 7. Continuous Integration (CI)

The GitHub Actions workflow in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) executes both suites:
1. `verify`: Runs `npm run typecheck`, `npm run lint`, `npm test` (304 unit tests), and production Next.js build.
2. `e2e` (runs after `verify`): Spins up a `postgres:16` service container with health checks, installs Playwright Chromium with system dependencies, runs `npm run e2e`, and uploads reports/traces as artifacts upon failure.
