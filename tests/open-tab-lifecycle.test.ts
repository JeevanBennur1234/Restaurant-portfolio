import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ctx } from "@/server/services/result";
import {
  getActiveTab,
  placeTabRound,
  requestTabBill,
  createTabRazorpayOrder,
  verifyTabPayment,
  testVerifyTabPayment,
  settleTabAtCounter,
  buildTabReceiptData,
} from "@/server/services/tabs";

// Mock environment and realtime
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://mock",
    APP_URL: "http://localhost:3000",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
    PAYMENTS_MODE: "online",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/razorpay", () => ({
  createRazorpayOrder: vi.fn().mockResolvedValue({
    id: "order_rzp_mock_123",
    amount: 52500,
    currency: "INR",
    receipt: "ML-TAB-test",
    status: "created",
    keyId: "rzp_test_mock_key",
  }),
  verifyRazorpaySignature: vi.fn().mockReturnValue(true),
  isOnlinePaymentsEnabled: vi.fn().mockReturnValue(true),
  isRazorpayTestMode: vi.fn().mockReturnValue(true),
}));

describe("Dine-In Open Tab Lifecycle", () => {
  const mockRestaurant = {
    id: "rest-1",
    name: "Masala Lane",
    slug: "masala-lane",
    currency: "INR",
    gstin: "29AABCS1429B1ZB",
    fssaiLicense: "11223344556677",
  };

  const mockTable = {
    id: "tbl-7",
    restaurantId: "rest-1",
    tableNumber: "T-07",
    capacity: 4,
    qrToken: "tab-test-token-7",
    isActive: true,
    restaurant: mockRestaurant,
  };

  const mockMenuItems = [
    {
      id: "item-biryani",
      restaurantId: "rest-1",
      name: "Hyderabadi Dum Biryani",
      pricePaise: 35000,
      isAvailable: true,
      isActive: true,
    },
    {
      id: "item-lassi",
      restaurantId: "rest-1",
      name: "Mango Lassi",
      pricePaise: 15000,
      isAvailable: true,
      isActive: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getActiveTab", () => {
    it("fails when table token is empty", async () => {
      const mockCtx = { db: {} } as unknown as Ctx;
      const res = await getActiveTab(mockCtx, "");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("VALIDATION");
      }
    });

    it("returns 404 if table is not found", async () => {
      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getActiveTab(mockCtx, "unknown-token");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("NOT_FOUND");
        expect(res.status).toBe(404);
      }
    });

    it("returns null if table has no active dining tab", async () => {
      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getActiveTab(mockCtx, "tab-test-token-7");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).toBeNull();
      }
    });

    it("returns tab details and rounds when active session exists", async () => {
      const now = new Date();
      const mockSession = {
        id: "session-1",
        sessionToken: "st-1234",
        tableId: "tbl-7",
        restaurantId: "rest-1",
        status: "active",
        paymentStatus: "open",
        paymentMethod: null,
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        customerName: "Rahul",
        customerPhone: "9876543210",
        createdAt: now,
        closedAt: null,
        orders: [
          {
            id: "ord-1",
            orderNumber: "ML-1001",
            roundNumber: 1,
            status: "placed",
            paymentStatus: "counter",
            subtotalPaise: 50000,
            taxPaise: 2500,
            totalPaise: 52500,
            createdAt: now,
            items: [
              {
                id: "item-1",
                itemName: "Hyderabadi Dum Biryani",
                itemPricePaise: 35000,
                quantity: 1,
                selectedModifiersJson: null,
                totalPaise: 35000,
                notes: "Spicy",
              },
            ],
          },
        ],
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getActiveTab(mockCtx, "tab-test-token-7");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data).not.toBeNull();
        expect(res.data?.id).toBe("session-1");
        expect(res.data?.roundCount).toBe(1);
        expect(res.data?.totalPaise).toBe(52500);
        expect(res.data?.formattedTotal).toBe("₹525");
        expect(res.data?.orders[0].items[0].itemName).toBe("Hyderabadi Dum Biryani");
      }
    });
  });

  describe("placeTabRound", () => {
    it("validates input and computes server-side price correctly", async () => {
      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            menuItems: {
              findMany: vi.fn().mockResolvedValue(mockMenuItems),
            },
            modifiers: {
              findMany: vi.fn().mockResolvedValue([]),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(null), // fresh tab
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              query: {
                diningSessions: {
                  findFirst: vi.fn().mockResolvedValue(null),
                },
                orders: {
                  findMany: vi.fn().mockResolvedValue([]),
                },
              },
              insert: () => ({
                values: (vals: Record<string, unknown>) => ({
                  returning: vi.fn().mockImplementation(() => {
                    return Promise.resolve([
                      {
                        id: vals.sessionToken ? "session-new" : "ord-new",
                        sessionToken: vals.sessionToken,
                        orderNumber: "ML-2001",
                        status: "placed",
                        subtotalPaise: 0,
                        taxPaise: 0,
                        totalPaise: 0,
                      },
                    ]);
                  }),
                  onConflictDoUpdate: () => ({
                    returning: vi.fn().mockResolvedValue([{ lastOrderNumber: 1 }]),
                  }),
                }),
              }),
              update: () => ({
                set: () => ({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await placeTabRound(mockCtx, {
        token: "tab-test-token-7",
        items: [
          {
            menuItemId: "item-biryani",
            quantity: 1,
            selectedModifierIds: [],
          },
          {
            menuItemId: "item-lassi",
            quantity: 1,
            selectedModifierIds: [],
          },
        ],
        customerName: "Priya",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.roundNumber).toBe(1);
        // Subtotal = 35000 + 15000 = 50000
        // Tax 5% = 2500
        // Total = 52500
        expect(res.data.orderTotalPaise).toBe(52500);
        expect(res.data.tabTotalPaise).toBe(52500);
      }
    });

    it("attaches round 2 to existing open tab and updates cumulative bill", async () => {
      const existingSession = {
        id: "session-existing",
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        orders: [{ id: "ord-1", roundNumber: 1 }],
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            menuItems: {
              findMany: vi.fn().mockResolvedValue([mockMenuItems[1]]), // Mango Lassi (15000 paise)
            },
            modifiers: {
              findMany: vi.fn().mockResolvedValue([]),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(existingSession),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              query: {
                diningSessions: {
                  findFirst: vi.fn().mockResolvedValue(existingSession),
                },
                orders: {
                  findMany: vi.fn().mockResolvedValue([{ id: "ord-1", roundNumber: 1 }]),
                },
              },
              insert: () => ({
                values: () => ({
                  returning: vi.fn().mockResolvedValue([
                    {
                      id: "ord-round-2",
                      orderNumber: "ML-2002",
                      status: "placed",
                    },
                  ]),
                  onConflictDoUpdate: () => ({
                    returning: vi.fn().mockResolvedValue([{ lastOrderNumber: 2 }]),
                  }),
                }),
              }),
              update: () => ({
                set: () => ({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await placeTabRound(mockCtx, {
        token: "tab-test-token-7",
        items: [
          {
            menuItemId: "item-lassi",
            quantity: 2, // 2 x 15000 = 30000
            selectedModifierIds: [],
          },
        ],
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.roundNumber).toBe(2);
        // Round 2 order: Subtotal = 30000, Tax = 1500, Total = 31500
        expect(res.data.orderTotalPaise).toBe(31500);
        // Cumulative Tab: 52500 + 31500 = 84000 paise
        expect(res.data.tabTotalPaise).toBe(84000);
      }
    });

    it("rejects order if menu item is sold out", async () => {
      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            menuItems: {
              findMany: vi.fn().mockResolvedValue([
                {
                  id: "item-sold-out",
                  restaurantId: "rest-1",
                  name: "Paneer Tikka",
                  pricePaise: 28000,
                  isAvailable: false, // SOLD OUT
                  isActive: true,
                },
              ]),
            },
            modifiers: {
              findMany: vi.fn().mockResolvedValue([]),
            },
          },
        },
      } as unknown as Ctx;

      const res = await placeTabRound(mockCtx, {
        token: "tab-test-token-7",
        items: [
          {
            menuItemId: "item-sold-out",
            quantity: 1,
            selectedModifierIds: [],
          },
        ],
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CONFLICT");
        expect(res.message).toContain("sold out");
      }
    });
  });

  describe("requestTabBill", () => {
    it("updates tab status to bill_requested", async () => {
      const mockSession = {
        id: "session-1",
        restaurantId: "rest-1",
        tableId: "tbl-7",
        totalPaise: 52500,
        status: "active",
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue(undefined),
            }),
          }),
        },
      } as unknown as Ctx;

      const res = await requestTabBill(mockCtx, {
        token: "tab-test-token-7",
        paymentMethod: "counter",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.status).toBe("bill_requested");
        expect(res.data.totalPaise).toBe(52500);
      }
    });

    it("fails if tab total is zero", async () => {
      const mockSession = {
        id: "session-empty",
        restaurantId: "rest-1",
        tableId: "tbl-7",
        totalPaise: 0,
        status: "active",
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await requestTabBill(mockCtx, {
        token: "tab-test-token-7",
        paymentMethod: "pay_now",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("VALIDATION");
        expect(res.message).toContain("empty tab");
      }
    });
  });

  describe("createTabRazorpayOrder & verifyTabPayment", () => {
    it("creates a Razorpay order for active tab total", async () => {
      const mockSession = {
        id: "session-1",
        totalPaise: 52500,
        orders: [{ id: "ord-1" }],
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        },
      } as unknown as Ctx;

      const res = await createTabRazorpayOrder(mockCtx, "tab-test-token-7");
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.razorpayOrderId).toBe("order_rzp_mock_123");
        expect(res.data.amountPaise).toBe(52500);
      }
    });

    it("verifies payment signature and marks session and all orders as paid", async () => {
      const mockSession = {
        id: "session-1",
        restaurantId: "rest-1",
        tableId: "tbl-7",
        orders: [{ id: "ord-1" }, { id: "ord-2" }],
      };

      const updateSpy = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const insertSpy = vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              update: updateSpy,
              insert: insertSpy,
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await verifyTabPayment(mockCtx, {
        token: "tab-test-token-7",
        razorpayOrderId: "order_rzp_mock_123",
        razorpayPaymentId: "pay_rzp_mock_456",
        razorpaySignature: "valid_hmac_signature",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.success).toBe(true);
        expect(res.data.tabId).toBe("session-1");
      }
      expect(mockCtx.db.transaction).toHaveBeenCalled();
    });

    it("supports testVerifyTabPayment when test simulation is allowed", async () => {
      const mockSession = {
        id: "session-sim",
        restaurantId: "rest-1",
        tableId: "tbl-7",
        totalPaise: 42000,
        orders: [{ id: "ord-sim-1" }],
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue(undefined),
              }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await testVerifyTabPayment(mockCtx, {
        token: "tab-test-token-7",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.tabId).toBe("session-sim");
      }
    });
  });

  describe("settleTabAtCounter", () => {
    it("rejects unauthorized non-manager actors", async () => {
      const mockCtx = {
        actor: {
          userId: "waiter-1",
          restaurantId: "rest-1",
          role: "waiter" as unknown as "manager", // Not manager/admin
          username: "staff_waiter",
        },
        db: {},
      } as unknown as Ctx;

      const res = await settleTabAtCounter(mockCtx, {
        tabId: "session-1",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("UNAUTHENTICATED");
        expect(res.status).toBe(401);
      }
    });

    it("settles tab at counter with manager audit trail", async () => {
      const mockSession = {
        id: "session-counter-1",
        restaurantId: "rest-1",
        status: "active",
        totalPaise: 65000,
        table: { tableNumber: "T-07" },
        orders: [{ id: "ord-c-1" }],
      };

      const mockCtx = {
        actor: {
          userId: "mgr-1",
          restaurantId: "rest-1",
          role: "manager" as const,
          username: "manager_anil",
        },
        db: {
          query: {
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              update: vi.fn().mockReturnValue({
                set: vi.fn().mockReturnValue({
                  where: vi.fn().mockResolvedValue(undefined),
                }),
              }),
              insert: vi.fn().mockReturnValue({
                values: vi.fn().mockResolvedValue(undefined),
              }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await settleTabAtCounter(mockCtx, {
        tabId: "session-counter-1",
        paymentMethod: "card",
        notes: "Settled via card machine at register",
      });

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.success).toBe(true);
        expect(res.data.tabId).toBe("session-counter-1");
      }
    });

    it("prevents double-settlement if tab is already closed", async () => {
      const closedSession = {
        id: "session-already-closed",
        restaurantId: "rest-1",
        status: "closed",
        totalPaise: 65000,
        table: { tableNumber: "T-07" },
        orders: [],
      };

      const mockCtx = {
        actor: {
          userId: "mgr-1",
          restaurantId: "rest-1",
          role: "manager" as const,
          username: "manager_anil",
        },
        db: {
          query: {
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(closedSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await settleTabAtCounter(mockCtx, {
        tabId: "session-already-closed",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("CONFLICT");
        expect(res.status).toBe(409);
      }
    });
  });

  describe("buildTabReceiptData", () => {
    it("consolidates multi-round items with 5% GST breakdown", () => {
      const now = new Date();
      const mockSession = {
        id: "session-full-1234",
        table: { tableNumber: "T-07" },
        restaurant: { name: "Masala Lane" },
        status: "closed",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        customerName: "Sneha",
        customerPhone: "9988776655",
        subtotalPaise: 50000,
        taxPaise: 2500,
        totalPaise: 52500,
        createdAt: now,
        updatedAt: now,
        closedAt: now,
        orders: [
          {
            id: "ord-1",
            orderNumber: "ML-1001",
            roundNumber: 1,
            items: [
              {
                id: "item-1",
                itemName: "Hyderabadi Dum Biryani",
                itemPricePaise: 35000,
                quantity: 1,
                selectedModifiersJson: null,
                totalPaise: 35000,
                notes: null,
              },
            ],
          },
          {
            id: "ord-2",
            orderNumber: "ML-1002",
            roundNumber: 2,
            items: [
              {
                id: "item-2",
                itemName: "Mango Lassi",
                itemPricePaise: 15000,
                quantity: 1,
                selectedModifiersJson: null,
                totalPaise: 15000,
                notes: null,
              },
            ],
          },
        ],
      };

      const receipt = buildTabReceiptData(mockSession);

      expect(receipt.tableNumber).toBe("T-07");
      expect(receipt.customer?.name).toBe("Sneha");
      expect(receipt.subtotalPaise).toBe(50000);
      expect(receipt.cgstPaise).toBe(1250);
      expect(receipt.sgstPaise).toBe(1250);
      expect(receipt.taxPaise).toBe(2500);
      expect(receipt.totalPaise).toBe(52500);
      expect(receipt.items.length).toBe(2);
      expect(receipt.items[0].name).toContain("Round 1");
      expect(receipt.items[1].name).toContain("Round 2");
    });
  });
});
