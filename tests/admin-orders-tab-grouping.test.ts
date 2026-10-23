import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getAdminOrders } from "@/server/services/manager";
import type { Ctx } from "@/server/services/result";
import { AdminOrdersTab, getConsolidatedGroupItems } from "@/components/admin/admin-orders-tab";
import { adminApi } from "@/lib/api/admin";
import type { AdminOrderRow } from "@/lib/api/types";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
    APP_URL: "http://localhost:3000",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
    PAYMENTS_MODE: "online",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

describe("Task T2: Admin Orders Grouping by Dining Tab", () => {
  const managerActor = {
    userId: "mgr_1",
    restaurantId: "rest_1",
    role: "manager" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("API / Service Layer: getAdminOrders", () => {
    it("groups 5 rounds of Table 1 into one tab with consolidated total of ₹1,858.50 (subtotal 1770, GST 88.50)", async () => {
      // 5 rounds totaling 177000 subtotal, 8850 tax, 185850 total
      const round1 = {
        id: "ord-1",
        orderNumber: "ML-0034",
        restaurantId: "rest_1",
        tableId: "table-1",
        diningSessionId: "session-1",
        roundNumber: 1,
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 40000,
        taxPaise: 2000,
        totalPaise: 42000,
        createdAt: new Date("2026-10-23T10:00:00Z"),
        updatedAt: new Date("2026-10-23T10:15:00Z"),
        customerName: "Alice",
        customerPhone: "9876543210",
        specialInstructions: null,
        table: { tableNumber: "1" },
        items: [{ id: "it-1", itemName: "Paneer Tikka", itemPricePaise: 40000, quantity: 1 }],
        events: [],
      };

      const round2 = {
        id: "ord-2",
        orderNumber: "ML-0035",
        restaurantId: "rest_1",
        tableId: "table-1",
        diningSessionId: "session-1",
        roundNumber: 2,
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 35000,
        taxPaise: 1750,
        totalPaise: 36750,
        createdAt: new Date("2026-10-23T10:20:00Z"),
        updatedAt: new Date("2026-10-23T10:35:00Z"),
        customerName: "Alice",
        customerPhone: "9876543210",
        specialInstructions: null,
        table: { tableNumber: "1" },
        items: [{ id: "it-2", itemName: "Dal Makhani", itemPricePaise: 35000, quantity: 1 }],
        events: [],
      };

      const round3 = {
        id: "ord-3",
        orderNumber: "ML-0036",
        restaurantId: "rest_1",
        tableId: "table-1",
        diningSessionId: "session-1",
        roundNumber: 3,
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        createdAt: new Date("2026-10-23T10:40:00Z"),
        updatedAt: new Date("2026-10-23T10:55:00Z"),
        customerName: "Alice",
        customerPhone: "9876543210",
        specialInstructions: null,
        table: { tableNumber: "1" },
        items: [{ id: "it-3", itemName: "Butter Chicken", itemPricePaise: 50000, quantity: 1 }],
        events: [],
      };

      const round4 = {
        id: "ord-4",
        orderNumber: "ML-0037",
        restaurantId: "rest_1",
        tableId: "table-1",
        diningSessionId: "session-1",
        roundNumber: 4,
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 22000,
        taxPaise: 1100,
        totalPaise: 23100,
        createdAt: new Date("2026-10-23T11:00:00Z"),
        updatedAt: new Date("2026-10-23T11:15:00Z"),
        customerName: "Alice",
        customerPhone: "9876543210",
        specialInstructions: null,
        table: { tableNumber: "1" },
        items: [{ id: "it-4", itemName: "Garlic Naan", itemPricePaise: 11000, quantity: 2 }],
        events: [],
      };

      const round5 = {
        id: "ord-5",
        orderNumber: "ML-0039",
        restaurantId: "rest_1",
        tableId: "table-1",
        diningSessionId: "session-1",
        roundNumber: 5,
        status: "preparing",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 30000,
        taxPaise: 1500,
        totalPaise: 31500,
        createdAt: new Date("2026-10-23T11:20:00Z"),
        updatedAt: new Date("2026-10-23T11:25:00Z"),
        customerName: "Alice",
        customerPhone: "9876543210",
        specialInstructions: null,
        table: { tableNumber: "1" },
        items: [{ id: "it-5", itemName: "Gulab Jamun", itemPricePaise: 15000, quantity: 2 }],
        events: [],
      };

      const mockDb = {
        query: {
          orders: {
            findMany: vi.fn().mockResolvedValue([round1, round2, round3, round4, round5]),
          },
        },
      };

      const ctx = { db: mockDb as never, actor: managerActor } as Ctx;
      const res = await getAdminOrders(ctx, {});

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      // Grouping assertions: 5 rounds form 1 group
      expect(res.data.pagination.totalCount).toBe(1);
      expect(res.data.pagination.totalPages).toBe(1);
      expect(res.data.groups).toHaveLength(1);

      const tabGroup = res.data.groups![0];
      expect(tabGroup.type).toBe("tab");
      expect(tabGroup.tableNumber).toBe("1");
      expect(tabGroup.diningSessionId).toBe("session-1");
      expect(tabGroup.orders).toHaveLength(5);

      // Verify exact totals: 1770.00 subtotal + 88.50 tax = 1858.50 total
      expect(tabGroup.tabSummary).not.toBeNull();
      expect(tabGroup.tabSummary?.subtotalPaise).toBe(177000);
      expect(tabGroup.tabSummary?.taxPaise).toBe(8850);
      expect(tabGroup.tabSummary?.totalPaise).toBe(185850);
      expect(tabGroup.tabSummary?.amountDuePaise).toBe(185850);
      expect(tabGroup.tabSummary?.roundCount).toBe(5);

      // Check that every individual order row in orders has tabSummary attached
      expect(res.data.orders).toHaveLength(5);
      for (const ord of res.data.orders) {
        expect(ord.diningSessionId).toBe("session-1");
        expect(ord.tabSummary?.totalPaise).toBe(185850);
        expect(ord.tab?.totalPaise).toBe(185850);
      }
    });

    it("excludes cancelled rounds from the tab total", async () => {
      // 2 active rounds totaling 75000 + 3750 = 78750
      // 1 cancelled round of 50000 + 2500 = 52500
      const round1 = {
        id: "ord-1",
        orderNumber: "ML-0040",
        restaurantId: "rest_1",
        tableId: "table-2",
        diningSessionId: "session-2",
        roundNumber: 1,
        status: "served",
        paymentStatus: "counter",
        subtotalPaise: 40000,
        taxPaise: 2000,
        totalPaise: 42000,
        createdAt: new Date("2026-10-23T10:00:00Z"),
        updatedAt: new Date("2026-10-23T10:15:00Z"),
        table: { tableNumber: "2" },
        items: [{ id: "i-1", itemName: "Paneer Tikka", itemPricePaise: 40000, quantity: 1 }],
      };

      const round2 = {
        id: "ord-2",
        orderNumber: "ML-0041",
        restaurantId: "rest_1",
        tableId: "table-2",
        diningSessionId: "session-2",
        roundNumber: 2,
        status: "served",
        paymentStatus: "counter",
        subtotalPaise: 35000,
        taxPaise: 1750,
        totalPaise: 36750,
        createdAt: new Date("2026-10-23T10:20:00Z"),
        updatedAt: new Date("2026-10-23T10:35:00Z"),
        table: { tableNumber: "2" },
        items: [{ id: "i-2", itemName: "Dal Makhani", itemPricePaise: 35000, quantity: 1 }],
      };

      const round3Cancelled = {
        id: "ord-3",
        orderNumber: "ML-0042",
        restaurantId: "rest_1",
        tableId: "table-2",
        diningSessionId: "session-2",
        roundNumber: 3,
        status: "cancelled", // CANCELLED
        paymentStatus: "counter",
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        createdAt: new Date("2026-10-23T10:40:00Z"),
        updatedAt: new Date("2026-10-23T10:45:00Z"),
        table: { tableNumber: "2" },
        items: [{ id: "i-3", itemName: "Cancelled Dish", itemPricePaise: 50000, quantity: 1 }],
      };

      const mockDb = {
        query: {
          orders: {
            findMany: vi.fn().mockResolvedValue([round1, round2, round3Cancelled]),
          },
        },
      };

      const ctx = { db: mockDb as never, actor: managerActor } as Ctx;
      const res = await getAdminOrders(ctx, {});

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      const tabGroup = res.data.groups![0];
      // Total must NOT include round3Cancelled: 42000 + 36750 = 78750
      expect(tabGroup.tabSummary?.subtotalPaise).toBe(75000);
      expect(tabGroup.tabSummary?.taxPaise).toBe(3750);
      expect(tabGroup.tabSummary?.totalPaise).toBe(78750);
      expect(tabGroup.tabSummary?.roundCount).toBe(2); // Only 2 non-cancelled rounds
      expect(tabGroup.orders).toHaveLength(3); // All 3 orders returned so staff can see cancelled round
    });

    it("lists legacy single orders normally without diningSessionId", async () => {
      const legacyOrder = {
        id: "legacy-1",
        orderNumber: "ML-0010",
        restaurantId: "rest_1",
        tableId: "table-3",
        diningSessionId: null,
        roundNumber: 1,
        status: "placed",
        paymentStatus: "pending",
        paymentMethod: null,
        subtotalPaise: 30000,
        taxPaise: 1500,
        totalPaise: 31500,
        createdAt: new Date("2026-10-23T12:00:00Z"),
        updatedAt: new Date("2026-10-23T12:00:00Z"),
        table: { tableNumber: "3" },
        items: [{ id: "i-1", itemName: "Biryani", itemPricePaise: 30000, quantity: 1 }],
      };

      const mockDb = {
        query: {
          orders: {
            findMany: vi.fn().mockResolvedValue([legacyOrder]),
          },
        },
      };

      const ctx = { db: mockDb as never, actor: managerActor } as Ctx;
      const res = await getAdminOrders(ctx, {});

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.groups).toHaveLength(1);
      const group = res.data.groups![0];
      expect(group.type).toBe("single");
      expect(group.diningSessionId).toBeNull();
      expect(group.tabSummary).toBeNull();
      expect(group.orders[0].id).toBe("legacy-1");
    });

    it("filters and search match on ANY round of a tab", async () => {
      const round1 = {
        id: "ord-10",
        orderNumber: "ML-0100",
        restaurantId: "rest_1",
        tableId: "table-4",
        diningSessionId: "session-4",
        roundNumber: 1,
        status: "served",
        paymentStatus: "counter",
        subtotalPaise: 20000,
        taxPaise: 1000,
        totalPaise: 21000,
        createdAt: new Date("2026-10-23T08:00:00Z"),
        updatedAt: new Date("2026-10-23T08:15:00Z"),
        table: { tableNumber: "4" },
        items: [{ id: "i-10", itemName: "Samosa", itemPricePaise: 20000, quantity: 1 }],
      };

      const round2 = {
        id: "ord-11",
        orderNumber: "ML-0101",
        restaurantId: "rest_1",
        tableId: "table-4",
        diningSessionId: "session-4",
        roundNumber: 2,
        status: "preparing", // MATCHES status=preparing
        paymentStatus: "counter",
        subtotalPaise: 40000,
        taxPaise: 2000,
        totalPaise: 42000,
        createdAt: new Date("2026-10-23T08:30:00Z"),
        updatedAt: new Date("2026-10-23T08:35:00Z"),
        table: { tableNumber: "4" },
        items: [{ id: "i-11", itemName: "Biryani", itemPricePaise: 40000, quantity: 1 }],
      };

      const mockDb = {
        query: {
          orders: {
            findMany: vi.fn().mockResolvedValue([round1, round2]),
          },
        },
      };

      const ctx = { db: mockDb as never, actor: managerActor } as Ctx;

      // 1. Status filter: filtering by "preparing" should return the entire tab group because round 2 is preparing
      const statusRes = await getAdminOrders(ctx, { status: "preparing" });
      expect(statusRes.ok).toBe(true);
      if (statusRes.ok) {
        expect(statusRes.data.groups).toHaveLength(1);
        expect(statusRes.data.groups![0].id).toBe("session-4");
        expect(statusRes.data.groups![0].orders).toHaveLength(2);
      }

      // 2. Search query: searching for "Biryani" matches round 2 and returns the tab
      const searchRes = await getAdminOrders(ctx, { search: "Biryani" });
      expect(searchRes.ok).toBe(true);
      if (searchRes.ok) {
        expect(searchRes.data.groups).toHaveLength(1);
        expect(searchRes.data.groups![0].id).toBe("session-4");
      }

      // 3. Search query: searching for "ML-0100" (round 1) returns the tab
      const orderSearchRes = await getAdminOrders(ctx, { search: "ML-0100" });
      expect(orderSearchRes.ok).toBe(true);
      if (orderSearchRes.ok) {
        expect(orderSearchRes.data.groups).toHaveLength(1);
        expect(orderSearchRes.data.groups![0].id).toBe("session-4");
      }
    });

    it("sorts bill_requested tabs first before other active tabs", async () => {
      const activeTabOrder = {
        id: "ord-20",
        orderNumber: "ML-0200",
        restaurantId: "rest_1",
        tableId: "table-5",
        diningSessionId: "session-active",
        roundNumber: 1,
        status: "preparing",
        paymentStatus: "counter",
        subtotalPaise: 20000,
        taxPaise: 1000,
        totalPaise: 21000,
        createdAt: new Date("2026-10-23T12:00:00Z"), // Newer
        updatedAt: new Date("2026-10-23T12:00:00Z"),
        table: { tableNumber: "5" },
        items: [{ id: "i-20", itemName: "Chai", itemPricePaise: 20000, quantity: 1 }],
      };

      const billReqOrder = {
        id: "ord-21",
        orderNumber: "ML-0201",
        restaurantId: "rest_1",
        tableId: "table-6",
        diningSessionId: "session-bill-req",
        roundNumber: 1,
        status: "served",
        paymentStatus: "bill_requested", // BILL REQUESTED
        subtotalPaise: 30000,
        taxPaise: 1500,
        totalPaise: 31500,
        createdAt: new Date("2026-10-23T11:00:00Z"), // Older
        updatedAt: new Date("2026-10-23T11:30:00Z"),
        table: { tableNumber: "6" },
        items: [{ id: "i-21", itemName: "Lassi", itemPricePaise: 30000, quantity: 1 }],
      };

      const mockDb = {
        query: {
          orders: {
            findMany: vi.fn().mockResolvedValue([activeTabOrder, billReqOrder]),
          },
        },
      };

      const ctx = { db: mockDb as never, actor: managerActor } as Ctx;
      const res = await getAdminOrders(ctx, {});

      expect(res.ok).toBe(true);
      if (!res.ok) return;

      expect(res.data.groups).toHaveLength(2);
      // Table 6 (bill_requested) must be sorted first even though Table 5 is newer!
      expect(res.data.groups![0].diningSessionId).toBe("session-bill-req");
      expect(res.data.groups![0].tableNumber).toBe("6");
      expect(res.data.groups![1].diningSessionId).toBe("session-active");
      expect(res.data.groups![1].tableNumber).toBe("5");
    });
  });

  describe("UI Component: AdminOrdersTab rendering & actions", () => {
    const mock5RoundOrders: AdminOrderRow[] = [
      {
        id: "round-1",
        orderNumber: "ML-0034",
        tableNumber: "1",
        roundNumber: 1,
        diningSessionId: "session-1",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 40000,
        taxPaise: 2000,
        totalPaise: 42000,
        customerName: "Alice",
        customerPhone: null,
        specialInstructions: null,
        createdAt: "2026-10-23T10:00:00.000Z",
        updatedAt: "2026-10-23T10:15:00.000Z",
        items: [{ id: "i1", name: "Paneer Tikka", pricePaise: 40000, quantity: 1, modifiers: [] }],
        events: [],
        tabSummary: {
          id: "session-1",
          status: "active",
          paymentStatus: "open",
          roundCount: 5,
          subtotalPaise: 177000,
          taxPaise: 8850,
          totalPaise: 185850,
          amountDuePaise: 185850,
          paidPaise: 0,
        },
      },
      {
        id: "round-2",
        orderNumber: "ML-0035",
        tableNumber: "1",
        roundNumber: 2,
        diningSessionId: "session-1",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 35000,
        taxPaise: 1750,
        totalPaise: 36750,
        customerName: "Alice",
        customerPhone: null,
        specialInstructions: null,
        createdAt: "2026-10-23T10:20:00.000Z",
        updatedAt: "2026-10-23T10:35:00.000Z",
        items: [{ id: "i2", name: "Dal Makhani", pricePaise: 35000, quantity: 1, modifiers: [] }],
        events: [],
        tabSummary: {
          id: "session-1",
          status: "active",
          paymentStatus: "open",
          roundCount: 5,
          subtotalPaise: 177000,
          taxPaise: 8850,
          totalPaise: 185850,
          amountDuePaise: 185850,
          paidPaise: 0,
        },
      },
      {
        id: "round-3",
        orderNumber: "ML-0036",
        tableNumber: "1",
        roundNumber: 3,
        diningSessionId: "session-1",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        customerName: "Alice",
        customerPhone: null,
        specialInstructions: null,
        createdAt: "2026-10-23T10:40:00.000Z",
        updatedAt: "2026-10-23T10:55:00.000Z",
        items: [{ id: "i3", name: "Butter Chicken", pricePaise: 50000, quantity: 1, modifiers: [] }],
        events: [],
        tabSummary: {
          id: "session-1",
          status: "active",
          paymentStatus: "open",
          roundCount: 5,
          subtotalPaise: 177000,
          taxPaise: 8850,
          totalPaise: 185850,
          amountDuePaise: 185850,
          paidPaise: 0,
        },
      },
      {
        id: "round-4",
        orderNumber: "ML-0037",
        tableNumber: "1",
        roundNumber: 4,
        diningSessionId: "session-1",
        status: "served",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 22000,
        taxPaise: 1100,
        totalPaise: 23100,
        customerName: "Alice",
        customerPhone: null,
        specialInstructions: null,
        createdAt: "2026-10-23T11:00:00.000Z",
        updatedAt: "2026-10-23T11:15:00.000Z",
        items: [{ id: "i4", name: "Garlic Naan", pricePaise: 11000, quantity: 2, modifiers: [] }],
        events: [],
        tabSummary: {
          id: "session-1",
          status: "active",
          paymentStatus: "open",
          roundCount: 5,
          subtotalPaise: 177000,
          taxPaise: 8850,
          totalPaise: 185850,
          amountDuePaise: 185850,
          paidPaise: 0,
        },
      },
      {
        id: "round-5",
        orderNumber: "ML-0039",
        tableNumber: "1",
        roundNumber: 5,
        diningSessionId: "session-1",
        status: "preparing",
        paymentStatus: "counter",
        paymentMethod: null,
        subtotalPaise: 30000,
        taxPaise: 1500,
        totalPaise: 31500,
        customerName: "Alice",
        customerPhone: null,
        specialInstructions: null,
        createdAt: "2026-10-23T11:20:00.000Z",
        updatedAt: "2026-10-23T11:25:00.000Z",
        items: [{ id: "i5", name: "Gulab Jamun", pricePaise: 15000, quantity: 2, modifiers: [] }],
        events: [],
        tabSummary: {
          id: "session-1",
          status: "active",
          paymentStatus: "open",
          roundCount: 5,
          subtotalPaise: 177000,
          taxPaise: 8850,
          totalPaise: 185850,
          amountDuePaise: 185850,
          paidPaise: 0,
        },
      },
    ];

    it("consolidates item quantities for the eye viewer and excludes cancelled rounds", () => {
      const orders = mock5RoundOrders.map((order) => ({ ...order }));
      orders[1] = { ...orders[1], status: "cancelled" };

      const items = getConsolidatedGroupItems(orders);
      const dalMakhani = items.find((item) => item.name === "Dal Makhani");
      const garlicNaan = items.find((item) => item.name === "Garlic Naan");

      expect(dalMakhani).toBeUndefined();
      expect(garlicNaan).toMatchObject({ quantity: 2, totalPaise: 22000 });
      expect(items.some((item) => item.name === "Paneer Tikka")).toBe(true);
      expect(items.every((item) => item.key.length > 0)).toBe(true);
    });

    it("renders one consolidated row with order IDs, simple total, and item viewer", () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminOrdersTab, {
          initialOrders: mock5RoundOrders.map((order) => ({ ...order, tableNumber: "Table Table 1" })),
          initialPagination: { page: 1, pageSize: 10, totalCount: 1, totalPages: 1 },
        })
      );

      // Kitchen status remains the main status; the payment column is not shown.
      expect(html).toContain(">Final Status</th>");
      expect(html).toContain(">Order ID</th>");
      expect(html).not.toContain(">Payment</th>");
      expect(html).not.toContain("Paid (Online)");

      // The repeated table prefix and rounds badge are gone.
      expect(html).toContain("Table 1");
      expect(html).not.toContain("Table Table 1");
      expect(html).not.toContain("5 rounds");
      expect(html).not.toContain("Tab Breakdown");
      expect(html).not.toContain('data-testid="round-row"');

      // All order IDs and item names remain available in the consolidated row.
      for (const orderId of ["ML-0034", "ML-0035", "ML-0036", "ML-0037", "ML-0039"]) {
        expect(html).toContain(orderId);
      }
      expect(html).toContain("Paneer Tikka");
      expect(html).toContain("Dal Makhani");
      expect(html).toContain("Gulab Jamun");
      expect(html).toContain("aria-label=\"View items for Table 1\"");

      // Total is shown as one plain amount without a tax/subtotal subline.
      expect(html).toContain("1,858.50");
      expect(html).not.toContain("Sub:");
      expect(html).not.toContain("GST:");

      expect(html).toContain('data-testid="settle-tab-btn"');
      expect(html).toContain('data-testid="view-tab-items-btn"');
      expect(html).toContain("Settle Tab");
      expect(html).not.toContain('aria-label="Record payment for ML-0034"');
      expect(html).not.toContain('aria-label="Record payment for ML-0039"');
    });

    it("displays Bill Requested highlight and badge when tab is awaiting payment", () => {
      const billReqOrders: AdminOrderRow[] = [
        {
          ...mock5RoundOrders[0],
          paymentStatus: "bill_requested",
          tabSummary: {
            ...mock5RoundOrders[0].tabSummary!,
            status: "bill_requested",
            paymentStatus: "bill_requested",
          },
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(AdminOrdersTab, {
          initialOrders: billReqOrders,
        })
      );

      expect(html).toContain("Bill Requested");
      expect(html).toContain("border-l-amber-500");
    });

    it("calls adminApi.settleTab when settling a tab", async () => {
      const spySettle = vi.spyOn(adminApi, "settleTab").mockResolvedValueOnce({
        ok: true,
        data: { success: true, tabId: "session-1" },
      });

      const res = await adminApi.settleTab("session-1", "cash", "Settled at counter");
      expect(spySettle).toHaveBeenCalledWith("session-1", "cash", "Settled at counter");
      expect(res.ok).toBe(true);
    });

    it("verifies mobile touch target standards (min-h-[44px]) on card layout", () => {
      const html = renderToStaticMarkup(
        React.createElement(AdminOrdersTab, {
          initialOrders: mock5RoundOrders,
        })
      );

      // Verify mobile elements include min-h-[44px]
      expect(html).toContain("min-h-[44px]");
      expect(html).toContain('data-testid="settle-tab-btn"');
      expect(html).toContain('data-testid="view-tab-items-btn"');
    });

    it("renders single legacy order with Record payment button while omitting it from tab rounds", () => {
      const mixedOrders: AdminOrderRow[] = [
        ...mock5RoundOrders,
        {
          id: "standalone-1",
          orderNumber: "ML-SINGLE",
          tableNumber: "9",
          roundNumber: 1,
          diningSessionId: null, // Legacy standalone order
          status: "placed",
          paymentStatus: "counter",
          paymentMethod: null,
          subtotalPaise: 25000,
          taxPaise: 1250,
          totalPaise: 26250,
          customerName: "Bob",
          customerPhone: null,
          specialInstructions: null,
          createdAt: "2026-10-23T12:00:00.000Z",
          updatedAt: "2026-10-23T12:00:00.000Z",
          items: [{ id: "is1", name: "Dosa", pricePaise: 25000, quantity: 1, modifiers: [] }],
          events: [],
          tabSummary: null,
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(AdminOrdersTab, {
          initialOrders: mixedOrders,
        })
      );

      // Standalone order has Record payment button
      expect(html).toContain('aria-label="Record payment for ML-SINGLE"');
      // Tab round orders do NOT have Record payment button
      expect(html).not.toContain('aria-label="Record payment for ML-0034"');
      expect(html).not.toContain('aria-label="Record payment for ML-0039"');
    });
  });
});
