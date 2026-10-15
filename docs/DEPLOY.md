# DinePulse Multi-Site Deployment Guide

This guide walks you through deploying DinePulse to **Vercel** as three isolated, dedicated sites (**Customer**, **Kitchen**, and **Manager**) connected to a **Supabase PostgreSQL** database.

---

## 1. Architecture & Domain Topology

DinePulse runs three distinct surfaces from a single unified codebase:
1. **Customer Site (`SITE=customer`)**: Guest mobile menu, table ordering (`/t/[token]`), order tracking, and Razorpay payments.
2. **Kitchen Site (`SITE=kitchen`)**: High-contrast Kitchen Display System (KDS) board (`/kitchen`) with audio notifications.
3. **Manager Site (`SITE=manager`)**: Admin console (`/admin`), menu management, table QR code PDF export, and sales analytics.

```
                    +------------------------------------+
                    |        Unified Git Repo            |
                    |   (github.com/.../dinepulse)       |
                    +-----------------+------------------+
                                      |
         +----------------------------+----------------------------+
         |                            |                            |
         v                            v                            v
+------------------+         +------------------+         +------------------+
|  Vercel Project  |         |  Vercel Project  |         |  Vercel Project  |
| dinepulse-cust   |         | dinepulse-kitch  |         | dinepulse-mgr    |
| (SITE=customer)  |         | (SITE=kitchen)   |         | (SITE=manager)   |
| order.foo.com    |         | kitchen.foo.com  |         | manager.foo.com  |
+--------+---------+         +--------+---------+         +--------+---------+
         |                            |                            |
         +----------------------------+----------------------------+
                                      |
                                      v
                        +---------------------------+
                        |   Supabase PostgreSQL     |
                        | (Transaction Pooler: 6543)|
                        +---------------------------+
```

### Why Shared Registrable Domains Matter

For demo mode and seamless cross-site experiences:
- In demo mode, the Customer site (`/demo`) renders the Kitchen and Manager consoles side-by-side in `<iframe>` embeds.
- To allow authentication cookies (`SameSite=Lax` or `SameSite=None`) and iframe embedding across sites, all three sites **must share the same registrable domain** (e.g. `order.yourdomain.com`, `kitchen.yourdomain.com`, `manager.yourdomain.com` all belong to `yourdomain.com`).

> [!WARNING]
> **The `*.vercel.app` Multi-Tenant Limitation**:
> `vercel.app` is listed on the [Public Suffix List](https://publicsuffix.org/). This means `my-app-cust.vercel.app` and `my-app-kitch.vercel.app` are treated by web browsers as completely separate top-level domains. Browsers block third-party cookies across distinct `vercel.app` subdomains. For demo iframe logins to work without cookie partition issues, **you must attach a custom domain with subdomains** to your three Vercel projects.

---

## 2. Setting Up 3 Vercel Projects

You will create **three separate projects** in the Vercel dashboard, all pointing to the exact same repository and Git branch (`main`).

### Step 1: Create the Customer Project
1. Go to [Vercel Dashboard](https://vercel.com/dashboard) -> **Add New...** -> **Project**.
2. Select your repository.
3. Configure project settings:
   - **Project Name**: `dinepulse-customer`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./` (leave default)
   - **Build & Development Settings**:
     - Toggle **Build Command**: `npm run build:customer`
     - **Output Directory**: `.next` (leave default)
     - **Install Command**: `npm install` (leave default)
4. Add Environment Variables (see Section 3 below).
5. Assign your custom domain: `order.yourdomain.com` (or `dinepulse.yourdomain.com`).

### Step 2: Create the Kitchen Project
1. In Vercel, click **Add New...** -> **Project** and select the **same repository**.
2. Configure project settings:
   - **Project Name**: `dinepulse-kitchen`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build & Development Settings**:
     - Toggle **Build Command**: `npm run build:kitchen`
     - **Output Directory**: `.next`
3. Add Environment Variables (see Section 3 below).
4. Assign your custom domain: `kitchen.yourdomain.com`.

### Step 3: Create the Manager Project
1. In Vercel, click **Add New...** -> **Project** and select the **same repository**.
2. Configure project settings:
   - **Project Name**: `dinepulse-manager`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: `./`
   - **Build & Development Settings**:
     - Toggle **Build Command**: `npm run build:manager`
     - **Output Directory**: `.next`
3. Add Environment Variables (see Section 3 below).
4. Assign your custom domain: `manager.yourdomain.com`.

---

## 3. Environment Variables Matrix

Every project requires environment variables configured under **Project Settings -> Environment Variables** in Vercel:

| Variable | Customer | Kitchen | Manager | Description & Example Value |
| :--- | :---: | :---: | :---: | :--- |
| `SITE` | `customer` | `kitchen` | `manager` | **Strictly required**. Determines route proxying and role gating. |
| `DATABASE_URL` | Yes | Yes | Yes | Supabase connection string with transaction pooler (`:6543`). |
| `SESSION_SECRET` | Yes | Yes | Yes | **MUST BE IDENTICAL** across all 3 projects (min 32 characters). |
| `NEXT_PUBLIC_APP_URL` | Yes | Yes | Yes | The project's own URL (e.g. `https://order.foo.com`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | Yes | Supabase API URL (`https://<project-ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | Yes | Supabase public anonymous API key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Yes | Supabase private service role key for storage and broadcasts. |
| `DEMO_MODE` | `"true"` or `"false"` | `"true"` or `"false"` | `"true"` or `"false"` | Controls demo accounts, `/demo` page, and simulation buttons. |
| `DEMO_RESET_SECRET` | If Demo | No | No | Secret required to authorize `/api/demo/reset`. |
| `NEXT_PUBLIC_KITCHEN_SITE_URL` | If Demo | No | No | Kitchen URL for demo navigation (`https://kitchen.foo.com`). |
| `NEXT_PUBLIC_MANAGER_SITE_URL` | If Demo | No | No | Manager URL for demo navigation (`https://manager.foo.com`). |
| `FRAME_ANCESTORS` | No | If Demo | If Demo | Allowed iframe origins (`https://order.foo.com`). |
| `RAZORPAY_KEY_ID` | Production | No | No | Razorpay API Key ID (`rzp_live_...` or `rzp_test_...`). |
| `RAZORPAY_KEY_SECRET` | Production | No | No | Razorpay Key Secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Production | No | No | Razorpay Webhook Secret. |
| `NEXT_PUBLIC_SITE_NAME` | Optional | Optional | Optional | Custom branding string (default: `"DinePulse"`). |

---

## 4. Supabase Connection Pooler & Database Limits

In a serverless platform like Vercel, requests spin up stateless functions on demand. A sudden burst of visitors can create dozens of concurrent connections.

### Runtime Connection String (`DATABASE_URL`)
Always use the **Supabase Transaction Pooler (port `6543`)** for your deployed sites:
```env
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

- **Port `6543`**: Connects via Supavisor / PgBouncer in transaction mode. Connections are returned to the pool as soon as each transaction completes.
- **`?pgbouncer=true`**: Tells Drizzle / Postgres client to avoid prepared statements that fail in transaction pooling mode.

### Database Migrations Connection String
For running schema migrations (`npm run db:migrate`), you need a session connection:
```env
MIGRATION_DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```
Port `5432` supports schema modifications and advisory locks required by Drizzle Kit.

---

## 5. Shared `SESSION_SECRET` & Validation

All three Vercel projects **MUST share the exact same `SESSION_SECRET`**.

### Why?
DinePulse signs session cookies using HMAC-SHA256 with this secret. In demo mode, the customer site authenticates staff accounts and redirects to kitchen or manager consoles. If the projects have different secrets, authentication will fail with invalid signature errors.

### Generating a Safe Secret
Generate a cryptographically random 48-byte base64 string:
```bash
openssl rand -base64 48
```

### Verifying Secret Consistency with `check-env`
To verify that all three projects have the same secret without revealing the secret itself, use the SHA-256 hash helpers:

```bash
# Print the SHA-256 hash of your local secret
npm run check-env -- --print-secret-hash

# Validate that a site's environment matches the expected hash
npm run check-env -- --site customer --expect-secret-hash <sha256-hash>
npm run check-env -- --site kitchen --expect-secret-hash <sha256-hash>
npm run check-env -- --site manager --expect-secret-hash <sha256-hash>
```

---

## 6. Razorpay Webhook Setup (Customer Site)

To accept guest payments in production:
1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Account & Settings** -> **Webhooks** -> **Add New Webhook**.
3. Fill in the fields:
   - **Webhook URL**: `https://order.yourdomain.com/api/webhooks/razorpay`
   - **Secret**: Enter a secure random string and set it as `RAZORPAY_WEBHOOK_SECRET` on your Customer Vercel project.
   - **Active Events**:
     - `order.paid`
     - `payment.captured`
     - `payment.failed`
4. Save the webhook.
5. In DinePulse, payment webhooks are strictly idempotent: duplicate delivery of the same event will not create duplicate orders or transition states twice.

---

## 7. GitHub Secrets & Repository Variables

DinePulse includes automated workflows in `.github/workflows/`:
1. `ci.yml`: Typechecks, lints, runs tests, and validates Next.js builds on every push/PR.
2. `smoke.yml`: Runs the production smoke test suite against live deployed URLs.
3. `demo-reset.yml`: Runs a scheduled reset every 6 hours (if `DEMO_MODE=true`).

### Configure Repository Variables
Go to **GitHub Repo -> Settings -> Secrets and variables -> Actions -> Variables** and add:
- `CUSTOMER_URL`: `https://order.yourdomain.com`
- `KITCHEN_URL`: `https://kitchen.yourdomain.com`
- `MANAGER_URL`: `https://manager.yourdomain.com`

### Configure Repository Secrets
Go to **GitHub Repo -> Settings -> Secrets and variables -> Actions -> Secrets** and add:
- `DEMO_RESET_URL`: `https://order.yourdomain.com/api/demo/reset`
- `DEMO_RESET_SECRET`: The same secret string configured in your Vercel `DEMO_RESET_SECRET`.

> [!NOTE]
> **GitHub Actions 60-Day Cron Inactivity Notice**:
> GitHub automatically disables scheduled workflows (`cron`) on repositories where no commit or repository activity has occurred in **60 days**. If this happens:
> - GitHub sends an email notification to the repository owner.
> - Go to the **Actions** tab in GitHub, select the disabled workflow (`Demo Reset` or `Production Smoke Test`), and click **Enable workflow**.
> - Pushing any commit will also keep scheduled workflows active.

---

## 8. Database Migrations Workflow

Always apply database migrations **before deploying new code**:

```bash
# 1. Point to your production database session connection (port 5432)
export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"

# 2. Run migrations
npm run db:migrate

# 3. If this is a fresh database, run initial seed
npm run db:seed
```

> [!IMPORTANT]
> Running migrations before deploying application code prevents schema mismatch errors during rolling Vercel deployments.

---

## 9. Switching Between Demo and Production

When you are ready to transition DinePulse from a demo showcase to live production operations:

| Step | Setting | Action |
| :--- | :--- | :--- |
| **1. Disable Demo Mode** | `DEMO_MODE="false"` | Set on all three Vercel projects (`customer`, `kitchen`, `manager`). |
| **2. Production Payments** | `RAZORPAY_*` | Add live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. |
| **3. Frame Ancestors** | `FRAME_ANCESTORS=""` | Remove `FRAME_ANCESTORS` on Kitchen and Manager projects so the portals cannot be embedded in iframes. |
| **4. Staff Accounts** | Passwords | Create strong, unique passwords for staff using the manager creation script (`npm run manager:create`). |
| **5. Storage Buckets** | Supabase | Ensure the `dishes` bucket in Supabase Storage has appropriate read-only public policies and authenticated upload policies. |

---

## 10. Post-Deployment Checklist

After deploying your three sites to Vercel, complete this checklist:

1. [ ] **Validate Environment Variables**:
   ```bash
   npm run check-env -- --site all
   ```
2. [ ] **Run Live Smoke Tests**:
   ```bash
   npm run smoke -- --customer https://order.yourdomain.com --kitchen https://kitchen.yourdomain.com --manager https://manager.yourdomain.com --demo
   ```
3. [ ] **Verify Guest Table Ordering**:
   - Open `https://order.yourdomain.com/t/demo-table-7`.
   - Add items to the cart and place an order.
4. [ ] **Verify Kitchen Display System (KDS)**:
   - Open `https://kitchen.yourdomain.com`.
   - Verify that the new order appears on the board.
   - Click "Accept" -> "Preparing" -> "Ready" -> "Served" to verify status advancement.
5. [ ] **Verify Manager Console**:
   - Open `https://manager.yourdomain.com`.
   - Log in and verify sales metrics, menu items, and PDF QR code export.
6. [ ] **Verify Automated Reset Workflow**:
   - In GitHub Actions, manually trigger `Demo Reset` with `dry_run: false` and verify HTTP 200 response.

---

## 11. Troubleshooting Common Issues

### 1. `Max client connections reached` / Pool Exhaustion
- **Cause**: Connecting directly to port `5432` from serverless functions.
- **Fix**: Update `DATABASE_URL` to use port `6543` with `?pgbouncer=true`. Check connection pooling limits in the Supabase Dashboard under **Project Settings -> Database -> Connection Pooling**.

### 2. Login Redirect Loops or "Session Invalid"
- **Cause**: Mismatched `SESSION_SECRET` between the three projects, or missing `aud` claim from legacy sessions.
- **Fix**: Check `npm run check-env -- --print-secret-hash` and ensure all three Vercel projects have the exact same `SESSION_SECRET` string. Clear browser cookies and log in again.

### 3. `Refused to frame... ancestor violates Content Security Policy`
- **Cause**: Kitchen or Manager sites are rejecting iframe embeds from the Customer site.
- **Fix**: Ensure `FRAME_ANCESTORS` in the Kitchen and Manager Vercel project settings includes the exact origin of the Customer site (e.g. `https://order.yourdomain.com`).

### 4. `Invalid Razorpay signature` on Webhook
- **Cause**: `RAZORPAY_WEBHOOK_SECRET` on the Customer site differs from the secret configured in the Razorpay Webhooks dashboard.
- **Fix**: Verify and align the secret in both places. Do not confuse `RAZORPAY_KEY_SECRET` with `RAZORPAY_WEBHOOK_SECRET`.

### 5. `404 Not Found` on `/admin` or `/kitchen`
- **Cause**: DinePulse enforces strict route isolation at the edge proxy.
- **Fix**:
  - `/kitchen` is **only** accessible on `SITE=kitchen`.
  - `/admin` is **only** accessible on `SITE=manager`.
  - Accessing `/admin` on `SITE=customer` is deliberately designed to return `404`. Ensure you are visiting the correct domain.
