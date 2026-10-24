import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TabModal } from "@/components/guest/tab-modal";
import { ActiveTabBanner } from "@/components/guest/active-tab-banner";
import { RoundStageTrack, formatStageTime } from "@/components/guest/round-stage-track";
import { OrderStepper, STEPS, getStepIndex } from "@/components/guest/order-stepper";
import { getOrderStatusHeadline } from "@/components/guest/order-live-tracker";
import type { TabDetailsData } from "@/lib/api/types";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock customerApi and razorpay-client
const mockTabResponse: { current: TabDetailsData | null } = { current: null };

vi.mock("@/lib/api/customer", () => ({
  customerApi: {
    getActiveTab: vi.fn(async () => {
      if (mockTabResponse.current) {
        return { ok: true, data: mockTabResponse.current };
      }
      return { ok: false, message: "Tab not found" };
    }),
    requestTabBill: vi.fn(async () => ({ ok: true })),
    createTabRazorpayPayment: vi.fn(async () => ({
      ok: true,
      data: { keyId: "test_key", amountPaise: 185850, razorpayOrderId: "order_mock" },
    })),
    verifyTabPayment: vi.fn(async () => ({ ok: true })),
    testVerifyTabPayment: vi.fn(async () => ({ ok: true })),
    getTabReceiptPdfUrl: vi.fn(() => "http://localhost:3000/api/v1/customer/receipt.pdf"),
  },
}));

vi.mock("@/lib/razorpay-client", () => ({
  loadRazorpayScript: vi.fn(async () => true),
}));

// Mock useLiveTab for deterministic render testing of TabModal
let mockLiveTabState = {
  tab: null as TabDetailsData | null,
  setTab: vi.fn(),
  isLoading: false,
  isReconnecting: false,
  isRealtimeLive: false,
  errorMessage: null as string | null,
  setErrorMessage: vi.fn(),
  refreshTab: vi.fn(),
};

vi.mock("@/components/guest/use-live-tab", () => ({
  useLiveTab: vi.fn(() => mockLiveTabState),
}));

describe("Task T3: Live Guest Dining Tab & Per-Round Stage Track", () => {
  const baseMockTab: TabDetailsData = {
    id: "tab-demo-1",
    sessionToken: "token_table_1",
    tableId: "tbl_1",
    tableNumber: "1",
    restaurantId: "rest_1",
    restaurantName: "Masala Lane",
    realtimeChannel: "restaurant:e3b0c44298fc1c149afbf4c8",
    status: "active",
    paymentStatus: "open",
    paymentMethod: null,
    roundCount: 3,
    subtotalPaise: 177000,
    taxPaise: 8850,
    totalPaise: 185850,
    paidPaise: 0,
    amountDuePaise: 185850,
    formattedSubtotal: "₹1,770.00",
    formattedTax: "₹88.50",
    formattedTotal: "₹1,858.50",
    formattedAmountDue: "₹1,858.50",
    customerName: "Aarav",
    customerPhone: null,
    createdAt: "2026-10-23T12:00:00Z",
    closedAt: null,
    paymentsEnabled: true,
    paymentsTestMode: true,
    orders: [
      {
        orderId: "ord-1",
        orderNumber: "ML-0034",
        roundNumber: 1,
        status: "served",
        paymentStatus: "counter",
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        createdAt: "2026-10-23T12:05:00Z",
        items: [
          {
            id: "i1",
            itemName: "Paneer Tikka",
            itemPricePaise: 50000,
            quantity: 1,
            selectedModifiers: [],
            totalPaise: 50000,
            notes: null,
          },
        ],
      },
      {
        orderId: "ord-2",
        orderNumber: "ML-0035",
        roundNumber: 2,
        status: "preparing",
        paymentStatus: "counter",
        subtotalPaise: 70000,
        taxPaise: 3500,
        totalPaise: 73500,
        createdAt: "2026-10-23T12:20:00Z",
        items: [
          {
            id: "i2",
            itemName: "Dal Makhani",
            itemPricePaise: 35000,
            quantity: 2,
            selectedModifiers: [],
            totalPaise: 70000,
            notes: null,
          },
        ],
      },
      {
        orderId: "ord-3",
        orderNumber: "ML-0036",
        roundNumber: 3,
        status: "placed",
        paymentStatus: "counter",
        subtotalPaise: 57000,
        taxPaise: 2850,
        totalPaise: 59850,
        createdAt: "2026-10-23T12:40:00Z",
        items: [
          {
            id: "i3",
            itemName: "Garlic Naan",
            itemPricePaise: 19000,
            quantity: 3,
            selectedModifiers: [],
            totalPaise: 57000,
            notes: null,
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Requirement 2: Calm Status Card & Wording for Each State", () => {
    it("renders State 1 (active): 'Your tab is open. Order more or request the bill anytime.' with 'Open Tab' badge", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: {
          ...baseMockTab,
          status: "active",
          paymentStatus: "open",
          paymentMethod: null,
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      // Aria-live on calm status card
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('data-testid="tab-status-card"');

      // Status card wording
      expect(html).toContain('data-testid="status-card-wording"');
      expect(html).toContain("Your tab is open. Order more or request the bill anytime.");

      // Badge
      expect(html).toContain('data-testid="tab-status-badge"');
      expect(html).toContain("Open Tab");

      // Actions when active: Add More Dishes & Request Bill
      expect(html).toContain("Add More Dishes");
      expect(html).toContain('data-testid="request-tab-bill-btn"');
      expect(html).toContain("Request Bill &amp; Pay");
    });

    it("renders State 2 (bill requested, pay at counter): keeps both payment choices available", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: {
          ...baseMockTab,
          status: "bill_requested",
          paymentStatus: "bill_requested",
          paymentMethod: "counter",
          formattedAmountDue: "₹1,858.50",
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      // Bill requested wording and payment options remain available even after selecting counter.
      expect(html).toContain(
        "Your bill is ready. Choose Pay Online or Pay at Counter below to settle the tab."
      );

      // Badge matches real state
      expect(html).toContain("Pay at Counter");

      // Customer can still choose online payment or counter payment after requesting the bill.
      expect(html).toContain('data-testid="pay-tab-online-btn"');
      expect(html).toContain('data-testid="settle-tab-counter-btn"');
      expect(html).not.toContain('data-testid="request-tab-bill-btn"');
    });

    it("renders State 3 (bill requested, pay online): Pay button with net amount due", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: {
          ...baseMockTab,
          status: "bill_requested",
          paymentStatus: "bill_requested",
          paymentMethod: "pay_now",
          formattedAmountDue: "₹1,858.50",
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      // Status card wording
      expect(html).toContain("Your bill is ready. Choose Pay Online or Pay at Counter below to settle the tab.");
      expect(html).toContain("Bill Requested");

      // Pay button with net amount due
      expect(html).toContain('data-testid="pay-tab-online-btn"');
      expect(html).toContain("Pay Now (₹1,858.50)");

      // Counter alternative button available
      expect(html).toContain('data-testid="settle-tab-counter-btn"');
    });

    it("renders State 4 (closed and paid): 'Paid. Thank you!' with receipt download", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: {
          ...baseMockTab,
          status: "closed",
          paymentStatus: "paid",
          paymentMethod: "counter",
          closedAt: "2026-10-23T13:00:00Z",
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      // Status card wording
      expect(html).toContain("Paid. Thank you!");
      expect(html).toContain("Paid · Settled");

      // Download Receipt button
      expect(html).toContain('data-testid="download-tab-receipt-btn"');
      expect(html).toContain("Download Receipt (PDF)");
    });
  });

  describe("Requirement 2: Complete Absence of Old Refresh Button & Amber Box", () => {
    it("never renders 'Refresh Tab Status' button or amber 'Counter payment requested' box", () => {
      const states: Array<TabDetailsData["status"]> = [
        "active",
        "bill_requested",
        "closed",
      ];
      const methods: Array<string | null> = ["counter", "pay_now", null];

      for (const st of states) {
        for (const me of methods) {
          mockLiveTabState = {
            ...mockLiveTabState,
            tab: {
              ...baseMockTab,
              status: st,
              paymentMethod: me,
            },
          };

          const html = renderToStaticMarkup(
            React.createElement(TabModal, {
              isOpen: true,
              onClose: vi.fn(),
              token: "token_table_1",
              tableLabel: "Table 1",
            })
          );

          // The old button must be absent
          expect(html).not.toContain("Refresh Tab Status");

          // The old amber text box must be absent
          expect(html).not.toContain("Counter payment requested");
          expect(html).not.toContain("Staff must confirm payment to close this tab");

          // The old forever-badge 'Counter Requested' must be absent
          expect(html).not.toContain(">Counter Requested<");
        }
      }
    });

    it("verifies in source code that the amber box and Refresh Tab Status button are deleted", () => {
      const tabModalSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/tab-modal.tsx"),
        "utf-8"
      );
      expect(tabModalSrc).not.toContain("Refresh Tab Status");
      expect(tabModalSrc).not.toContain("Counter payment requested");
      expect(tabModalSrc).not.toContain("Staff must confirm payment to close this tab");
    });
  });

  describe("Requirement 3: Per-Round Stage Track & Expand Behavior", () => {
    it("reuses stage sequence Placed → Preparing → Ready → Served from order-stepper.tsx", () => {
      expect(STEPS.map((s) => s.key)).toEqual([
        "placed",
        "preparing",
        "ready",
        "served",
      ]);
      expect(getStepIndex("placed")).toBe(0);
      expect(getStepIndex("accepted")).toBe(0.5);
      expect(getStepIndex("preparing")).toBe(1);
      expect(getStepIndex("ready")).toBe(2);
      expect(getStepIndex("served")).toBe(3);
      expect(getStepIndex("cancelled")).toBe(-1);
    });

    it("marks every customer progress step complete when served", () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderStepper, { status: "served" })
      );
      expect((html.match(/lucide lucide-check/g) ?? []).length).toBe(4);
      expect(html).not.toContain("animate-pulse");
      expect(html).not.toContain("ring-4");
    });

    it("shows a thank-you and counter-payment message after service", () => {
      const counterHeadline = getOrderStatusHeadline({
        status: "served",
        paymentStatus: "counter",
      });
      expect(counterHeadline.title).toBe("Thank You!");
      expect(counterHeadline.subtitle).toContain("Your order has been served.");
      expect(counterHeadline.subtitle).toContain("pay at the counter");

      const paidHeadline = getOrderStatusHeadline({
        status: "served",
        paymentStatus: "paid",
      });
      expect(paidHeadline.subtitle).toContain("Thank you for dining with us!");
      expect(paidHeadline.subtitle).not.toContain("pay at the counter");

      const readyHeadline = getOrderStatusHeadline({
        status: "ready",
        paymentStatus: "counter",
      });
      expect(readyHeadline.title).toBe("Plated & Ready to Serve");
    });

    it("highlights current stage and ticks completed stages for each status in RoundStageTrack", () => {
      // 1. Placed
      const placedHtml = renderToStaticMarkup(
        React.createElement(RoundStageTrack, {
          status: "placed",
          createdAt: "2026-10-23T12:05:00Z",
        })
      );
      expect(placedHtml).toContain('data-testid="stage-step-placed"');
      expect(placedHtml).toContain('data-stage-status="current"');
      expect(placedHtml).toContain('data-stage-current="true"');
      expect(placedHtml).toContain('data-testid="stage-step-preparing"');
      expect(placedHtml).toContain('data-stage-status="upcoming"');

      // 2. Preparing
      const prepHtml = renderToStaticMarkup(
        React.createElement(RoundStageTrack, {
          status: "preparing",
          createdAt: "2026-10-23T12:20:00Z",
        })
      );
      expect(prepHtml).toContain('data-stage-status="completed"'); // Placed completed
      expect(prepHtml).toContain('data-stage-status="current"'); // Preparing current

      // 3. Ready
      const readyHtml = renderToStaticMarkup(
        React.createElement(RoundStageTrack, {
          status: "ready",
          createdAt: "2026-10-23T12:35:00Z",
        })
      );
      expect(readyHtml).toContain('data-testid="stage-step-ready"');
      expect(readyHtml).toContain('data-stage-current="true"');

      // 4. Served
      const servedHtml = renderToStaticMarkup(
        React.createElement(RoundStageTrack, {
          status: "served",
          createdAt: "2026-10-23T12:00:00Z",
        })
      );
      expect(servedHtml).toContain('data-testid="stage-step-served"');
      expect(servedHtml).toContain('data-stage-status="completed"');

      // 5. Cancelled
      const cancelledHtml = renderToStaticMarkup(
        React.createElement(RoundStageTrack, {
          status: "cancelled",
        })
      );
      expect(cancelledHtml).toContain('data-testid="round-stage-cancelled"');
      expect(cancelledHtml).toContain("Cancelled");
      expect(cancelledHtml).toContain("excluded from the tab bill");
    });

    it("formats stage time when createdAt is provided", () => {
      const formatted = formatStageTime("2026-10-23T12:05:00Z");
      expect(formatted).not.toBeNull();
      expect(typeof formatted).toBe("string");
      expect(formatStageTime(undefined)).toBeNull();
      expect(formatStageTime("invalid-date")).toBeNull();
    });

    it("shows consolidated items and live progress for each order", () => {
      mockLiveTabState = { ...mockLiveTabState, tab: baseMockTab };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table Table 1",
        })
      );

      expect(html).toContain('data-testid="tab-items-summary"');
      expect(html).toContain("Items Ordered");
      expect(html).toContain("Table 1");
      expect(html).not.toContain("Table Table 1");
      expect(html).not.toContain("Dishes Ordered by Round");
      expect(html).not.toContain('data-testid="tab-round-');
      expect(html).not.toContain('data-testid="round-toggle-');
      expect(html).not.toContain("Round 1");
      expect(html).not.toContain("rounds");
      expect(html).toContain('data-testid="tab-order-progress"');
      expect(html).toContain("Order Progress");
      expect(html).toContain("Order ML-0034");
      expect(html).toContain("Order ML-0035");
      expect(html).toContain("Order ML-0036");
      expect((html.match(/data-testid="round-stage-track"/g) ?? []).length).toBe(3);
      expect(html).toContain('data-testid="stage-step-preparing"');
      expect(html).toContain("Placed");
      expect(html).toContain("Preparing");
      expect(html).toContain("Ready");
      expect(html).toContain("Served");
      expect(html).toContain("Paneer Tikka");
      expect(html).toContain("Dal Makhani");
      expect(html).toContain("Garlic Naan");
      expect(html).toContain("2 × Dal Makhani");
      expect(html).toContain("3 × Garlic Naan");
      expect(html).not.toContain("font-serif text-2xl font-bold");
    });

    it("keeps the consolidated bill correct while omitting cancelled items and per-round badges", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: {
          ...baseMockTab,
          paidPaise: 52500,
          orders: [
            {
              ...baseMockTab.orders[0],
              paymentStatus: "paid",
              alreadyPaidBeforeTab: true,
            },
            { ...baseMockTab.orders[1], status: "cancelled" },
            baseMockTab.orders[2],
          ],
        },
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      expect(html).toContain('data-testid="tab-items-summary"');
      expect(html).not.toContain("Dal Makhani");
      expect(html).not.toContain('data-testid="round-already-paid-1"');
      expect(html).not.toContain("line-through");
      expect(html).toContain("Order Progress");
      expect(html).toContain("Order ML-0034");
      expect(html).not.toContain("This order was cancelled and is excluded from the tab bill.");
      expect(html).toContain("Already paid");
      expect(html).toContain("Total Amount Due");
    });
  });

  describe("Requirement 1: Realtime Updates, Polling Fallback & Hidden Document Pause", () => {
    it("subscribes to HMAC-derived restaurant channel and tab/order channels in useLiveTab", () => {
      const useLiveTabSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/use-live-tab.ts"),
        "utf-8"
      );

      // 1. Channel subscription to HMAC-derived channel
      expect(useLiveTabSrc).toContain("realtimeChannel");
      expect(useLiveTabSrc).toContain("tab:${tabId}");
      expect(useLiveTabSrc).toContain("order:${ordId}");

      // 2. Realtime broadcast events
      expect(useLiveTabSrc).toContain('"tab.bill_requested"');
      expect(useLiveTabSrc).toContain('"tab.round_added"');
      expect(useLiveTabSrc).toContain('"tab.updated"');
      expect(useLiveTabSrc).toContain('"tab.closed"');
      expect(useLiveTabSrc).toContain('"order.status_changed"');
      expect(useLiveTabSrc).toContain('"order.paid"');
    });

    it("implements 5-second polling fallback that pauses when document is hidden", () => {
      const useLiveTabSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/use-live-tab.ts"),
        "utf-8"
      );

      // 5-second polling fallback
      expect(useLiveTabSrc).toContain("5000");

      // Pauses when hidden
      expect(useLiveTabSrc).toContain('document.visibilityState === "hidden"');

      // Resumes on visibilitychange to visible
      expect(useLiveTabSrc).toContain('"visibilitychange"');
      expect(useLiveTabSrc).toContain('document.visibilityState === "visible"');
    });

    it("shows small 'Reconnecting…' note when realtime and polling are unavailable", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: baseMockTab,
        isReconnecting: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(TabModal, {
          isOpen: true,
          onClose: vi.fn(),
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      expect(html).toContain('data-testid="tab-reconnecting-note"');
      expect(html).toContain("Reconnecting…");
    });

    it("ActiveTabBanner integrates useLiveTab and renders a simple live total", () => {
      mockLiveTabState = {
        ...mockLiveTabState,
        tab: baseMockTab,
        isReconnecting: false,
      };

      const html = renderToStaticMarkup(
        React.createElement(ActiveTabBanner, {
          token: "token_table_1",
          tableLabel: "Table 1",
        })
      );

      expect(html).toContain('data-testid="active-tab-banner"');
      expect(html).toContain("Open Dining Tab");
      expect(html).not.toContain("rounds");
      expect(html).toContain("Current bill:");
      expect(html).toContain("₹1,858.50");
      expect(html).toContain('data-testid="view-tab-btn"');
    });
  });

  describe("Requirement 5: Accessibility, Touch Targets & Motion Preferences", () => {
    it("round toggles and actions have at least 44px min touch targets", () => {
      const tabModalSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/tab-modal.tsx"),
        "utf-8"
      );
      const bannerSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/active-tab-banner.tsx"),
        "utf-8"
      );

      // Round toggle button min-h-[44px]
      expect(tabModalSrc).toContain("min-h-[44px]");

      // Banner view button min-h-[44px]
      expect(bannerSrc).toContain("min-h-[44px]");
    });

    it("respects prefers-reduced-motion across animated elements", () => {
      const tabModalSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/tab-modal.tsx"),
        "utf-8"
      );
      const trackSrc = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/guest/round-stage-track.tsx"),
        "utf-8"
      );

      expect(tabModalSrc).toContain("motion-reduce:transition-none");
      expect(trackSrc).toContain("motion-reduce:transition-none");
      expect(trackSrc).toContain("motion-reduce:animate-none");
    });
  });
});
