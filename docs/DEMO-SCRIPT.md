# DinePulse — 90-Second Screen Recording Demonstration Script

*Production recording script and narration guide for Intallo's DinePulse portfolio video.*

> **Notice**: This document is a screen recording guide and shot list. All demonstrations are performed against the local development environment using local demo data (`DEMO_MODE=true`) and simulated payment behavior.

---

## Technical Recording Setup

| Surface | Device Frame / Viewport | Target URL | Initial Authentication |
|---|---|---|---|
| **Guest Customer** | Mobile (390 × 844 px) | `http://localhost:3000/t/demo-table-7` | Public Table Token |
| **Kitchen KDS** | Tablet (1280 × 800 px) | `http://localhost:3001/kitchen` | One-tap Demo Staff Login |
| **Manager Admin** | Desktop (1440 × 900 px) | `http://localhost:3002/admin` | One-tap Demo Manager Login |

---

## Shot List & Narration Timeline (90 Seconds)

### Scene 1: Guest Mobile Menu & Table Ordering (00:00 – 00:15)

- **Timestamp**: `00:00 – 00:15` (15 seconds)
- **Viewport**: Mobile Phone (390 × 844)
- **URL**: `http://localhost:3000/t/demo-table-7`
- **On-Screen Actions**:
  1. Show Table 7 guest menu loading instantly.
  2. Scroll smoothly through starters and chaats.
  3. Tap "Dahi Ke Kebab" card (`data-testid="menu-item-card"`).
  4. In the item detail sheet, select "Mint & Coriander Chutney" modifier.
  5. Tap `Add to Order` (`data-testid="add-to-order-btn"`).
- **Narration / Voiceover**:
  > *"When guests sit at Masala Lane, they scan a table QR code and instantly browse a rich, visual menu on their own device. No app downloads or account logins required. They can customize dietary options and modifiers with immediate pricing feedback."*

---

### Scene 2: Cart Sheet & Idempotent Order Placement (00:15 – 00:30)

- **Timestamp**: `00:15 – 00:30` (15 seconds)
- **Viewport**: Mobile Phone (390 × 844)
- **URL**: `http://localhost:3000/t/demo-table-7` → `/t/demo-table-7/order/[id]`
- **On-Screen Actions**:
  1. Tap the floating bottom cart bar (`data-testid="cart-bar-btn"`).
  2. Slide up cart sheet showing subtotal and 5% GST calculated in integer paise.
  3. Select the "Pay at Counter" option (`data-testid="pay-counter-choice"`).
  4. Tap `Place Order` (`data-testid="checkout-submit-btn"`).
  5. Page transitions to `/t/demo-table-7/order/[id]` showing the Live Order Tracker with status **Order Placed & Queued** and the order badge (e.g. `#ML-0003`).
- **Narration / Voiceover**:
  > *"Guests review itemized subtotals with automated GST computation and choose their payment preference. Submitting the order sends an atomic, idempotent request to our REST API, protecting against duplicate tickets even during mobile network retries."*

---

### Scene 3: Instant Kitchen Ticket Ingestion & Prep Start (00:30 – 00:45)

- **Timestamp**: `00:30 – 00:45` (15 seconds)
- **Viewport**: Kitchen Tablet (1280 × 800)
- **URL**: `http://localhost:3001/kitchen`
- **On-Screen Actions**:
  1. Switch to kitchen tablet screen.
  2. Show the KDS board automatically displaying the new `#ML-0003` ticket in the queued column with live timer ticking.
  3. Tap `Start Prep` (`data-testid="ticket-action-btn"`).
  4. Ticket badge immediately updates to amber **Preparing** state.
- **Narration / Voiceover**:
  > *"Without manual waiter intervention, the kitchen display ingests the ticket in real time via Supabase Realtime broadcast. Expeditors see itemized ingredients and elapsed timers. Tapping 'Start Prep' transitions the ticket status atomically in PostgreSQL."*

---

### Scene 4: Kitchen Ready Transition & Realtime Guest Tracker Update (00:45 – 01:00)

- **Timestamp**: `00:45 – 01:00` (15 seconds)
- **Viewport**: Split screen / Side-by-side (Kitchen Tablet + Mobile Phone)
- **URL**: `http://localhost:3001/kitchen` and `http://localhost:3000/t/demo-table-7/order/[id]`
- **On-Screen Actions**:
  1. On the kitchen screen, tap `Mark Ready` (`data-testid="ticket-action-btn"`).
  2. Observe the guest phone screen updating automatically without page refresh to emerald **Plated & Ready to Serve**.
  3. Show the order stepper timeline illuminating the chef prep milestone.
- **Narration / Voiceover**:
  > *"When the dish is plated, the chef taps 'Mark Ready'. The guest's phone reflects the update immediately—keeping diners informed without floor staff having to check on station progress. If WebSocket notifications are delayed or unavailable, an integrated five-second polling fallback automatically synchronizes the latest status."*

---

### Scene 5: Manager Console Live Orders & Cancellation Audit (01:00 – 01:15)

- **Timestamp**: `01:00 – 01:15` (15 seconds)
- **Viewport**: Desktop (1440 × 900)
- **URL**: `http://localhost:3002/admin`
- **On-Screen Actions**:
  1. Switch to the Manager Console on port `3002`.
  2. Click the `Orders` tab (`data-testid="admin-nav-orders"`).
  3. Show the live orders table containing active and completed orders with revenue amounts.
  4. Highlight a sample order, click `Cancel Order` (`data-testid="cancel-order-btn"`).
  5. Type cancellation reason: `"Guest requested order cancellation"` in `data-testid="cancel-reason-input"`.
  6. Click `Confirm Cancellation` (`data-testid="confirm-cancel-btn"`). Show the `Cancelled` badge.
- **Narration / Voiceover**:
  > *"From the Manager Console, leadership has total floor visibility. Every order across tables can be audited in real time, and cancellations require an explicit reason that is permanently recorded in the audit event log."*

---

### Scene 6: Manager Reports, QR Generation & Intallo Wrap-up (01:15 – 01:30)

- **Timestamp**: `01:15 – 01:30` (15 seconds)
- **Viewport**: Desktop (1440 × 900)
- **URL**: `http://localhost:3002/admin` → `http://localhost:3000/demo`
- **On-Screen Actions**:
  1. Click `Tables` tab (`data-testid="admin-nav-tables"`), highlight `Download QR Sheet` button generating vector `%PDF` files.
  2. Click `Reports` tab (`data-testid="admin-nav-reports"`), showcasing Today's Gross Sales, Net Revenue, and Category distribution.
  3. Open `http://localhost:3000/demo` showing the dual-pane concept showcase (guest phone frame alongside toggleable operations tablet).
  4. Fade out with Intallo logo and website URL: `https://www.intallo.in`.
- **Narration / Voiceover**:
  > *"Managers can print high-resolution QR plaques directly from the browser and review real-time sales analytics. Three specialized roles, one cohesive Next.js codebase. DinePulse was engineered by Intallo—bespoke web applications and digital automation. Visit intallo.in."*

---

## Post-Production Checklist

- [ ] Record at 60 fps at native 1080p or 4K resolution.
- [ ] Ensure mouse pointer cursor smoothing is applied.
- [ ] Verify no development overlays or debug banners are visible.
- [ ] Add subtle audio chimes on ticket placement and kitchen ready transitions.
- [ ] Overlay Intallo brand typography (Playfair Display & Plus Jakarta Sans) and color palette (`#110F0E`, `#D97706`).
