# Multi-Site Architecture & Deployment Guide

DinePulse can run as three separate, isolated site deployments from a single unified codebase, controlled by the `SITE` environment variable:

```bash
SITE=customer | kitchen | manager | all   # Default: "all"
```

Each site calls its own `/api/v1` routes with same-origin requests (no cross-origin CORS complexity required).

---

## 1. Local Development Ports & Commands

| Site | Port | Dev Command | Build Command | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | `3000` | `npm run dev:customer` | `npm run build:customer` | Guest dining, table ordering, digital menu, payments |
| **Kitchen** | `3001` | `npm run dev:kitchen` | `npm run build:kitchen` | Kitchen Display System (KDS) & order queue |
| **Manager** | `3002` | `npm run dev:manager` | `npm run build:manager` | Admin dashboard, menu management, analytics & QR export |
| **All (Unified)**| `3000` | `npm run dev` | `npm run build` | Full legacy monolithic mode running all surfaces |

To launch all three site instances concurrently:
```bash
npm run dev:sites
```
During development, each site writes its build cache to an isolated directory (`.next-customer`, `.next-kitchen`, `.next-manager`) to prevent dev-server lock and cache collision.

---

## 2. Route Matrix & Rewrites

Routes are strictly enforced at the edge middleware proxy layer (`src/proxy.ts`). Requests to unauthorized routes return a **real 404** (rewritten to `/_not-found`).

| Route Pattern | `SITE=customer` | `SITE=kitchen` | `SITE=manager` | `SITE=all` |
| :--- | :---: | :---: | :---: | :---: |
| `/_next/*`, `/media/*`, `/images/*` | **Allow** | **Allow** | **Allow** | **Allow** |
| `/favicon.ico`, `/icon*`, `/opengraph-image*` | **Allow** | **Allow** | **Allow** | **Allow** |
| `/manifest.webmanifest`, `/robots.txt`, `/sitemap.xml` | **Allow** | **Allow** | **Allow** | **Allow** |
| `/api/v1/health` | **Allow** | **Allow** | **Allow** | **Allow** |
| `/` (Root) | **Allow** (`/`) | **Rewrite** (`/kitchen`) | **Rewrite** (`/admin`) | **Allow** (`/`) |
| `/t/*` (Guest Tables) | **Allow** | 404 | 404 | **Allow** |
| `/demo` (Demo Page) | **Allow** | 404 | 404 | **Allow** |
| `/kitchen`, `/kitchen/*` | 404 | **Allow** | 404 | **Allow** |
| `/admin`, `/admin/*` | 404 | 404 | **Allow** | **Allow** |
| `/api/v1/customer/*` | **Allow** | 404 | 404 | **Allow** |
| `/api/v1/kitchen/*` | 404 | **Allow** | 404 | **Allow** |
| `/api/v1/admin/*`, `/api/admin/*` | 404 | 404 | **Allow** | **Allow** |
| `/api/v1/auth/*` | 404 | **Allow** | **Allow** | **Allow** |
| `/api/webhooks/razorpay` | **Allow** | 404 | 404 | **Allow** |
| `/api/demo/reset` | **Allow** | 404 | 404 | **Allow** |
| `/api/v1/openapi.json` | **Allow** | 404 | 404 | **Allow** |

---

## 3. Per-Site Session Cookies & Token Isolation

Each site uses an isolated session cookie name and signed audience (`aud`) claim to eliminate session bleed across sites:

| Site | Session Cookie Name | Signed `aud` Claim |
| :--- | :--- | :--- |
| `customer` | `dinepulse_staff_session` | `"customer"` |
| `kitchen` | `dinepulse_kitchen_session` | `"kitchen"` |
| `manager` | `dinepulse_manager_session` | `"manager"` |
| `all` | `dinepulse_staff_session` | `"all"` |

- **Audience Enforcement**: Tokens signed for `SITE=kitchen` (`aud: "kitchen"`) are rejected by `SITE=manager`, even if stored under the same domain.
- **Legacy Tokens**: Tokens without an `aud` claim are treated as invalid, requiring users to log in again.
- **Logout Isolation**: Calling logout (`clearStaffSessionCookie()`) deletes only the current site's cookie.

---

## 4. Role Gates & Authentication

Staff authorization checks are strictly gated per site via `allowedRolesForSite()`:

| Site | Allowed Staff Roles | Non-Matching Role Behavior |
| :--- | :--- | :--- |
| `customer` | *None* | Login rejected ("This account can't sign in on this site.") |
| `kitchen` | `kitchen`, `manager`, `admin` | Login rejected ("This account can't sign in on this site.") |
| `manager` | `manager`, `admin` | Login rejected ("This account can't sign in on this site.") |
| `all` | `kitchen`, `manager`, `admin` | Allowed based on endpoint role check |

### Authentication Order & Security Rules:
1. **Rate Limiting**: Failed attempt counters are incremented prior to database comparison to prevent timing attacks.
2. **Password Verification**: Credentials must match before role evaluation occurs.
3. **Role Gating**:
   - If the password is correct but the role is disallowed on the site, `authenticateStaff` returns:
     `"This account can't sign in on this site."`
   - If the password is wrong, the generic error `"Invalid username or password"` is returned.

---

## 5. Security Headers & SEO Policies

1. **CSP `frame-ancestors`**:
   - When `FRAME_ANCESTORS` is defined (e.g. `http://localhost:3000`), CSP includes `frame-ancestors 'self' <origins>` and the obsolete `X-Frame-Options` header is dropped.
   - When `FRAME_ANCESTORS` is unset, `X-Frame-Options: SAMEORIGIN` is retained.
2. **Indexing & Bots**:
   - `kitchen` and `manager` sites send `X-Robots-Tag: noindex, nofollow, noarchive`.
   - `/robots.txt` disallows `/` for all user-agents on `kitchen` and `manager`.
   - `/sitemap.xml` returns an empty array `[]` on `kitchen` and `manager`.
3. **Branding**:
   - Setting `NEXT_PUBLIC_SITE_NAME` overrides the title template in the root layout (e.g. `%s | DinePulse Kitchen`).

---

## 6. Environment Variables Reference

```env
# Multi-site configuration
SITE=customer                         # Options: customer | kitchen | manager | all
FRAME_ANCESTORS=http://localhost:3000  # Comma-separated allowed iframe embedding origins
NEXT_PUBLIC_SITE_NAME=DinePulse       # Title branding template

# Database & Core Services (shared across instances)
DATABASE_URL=postgresql://...
SESSION_SECRET=...
NEXT_PUBLIC_APP_URL=https://...
```
