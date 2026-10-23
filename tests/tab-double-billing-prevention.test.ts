import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ctx } from "@/server/services/result";
import {
  getActiveTab,
  createTabRazorpayOrder,
  verifyTabPayment,
  settleTabAtCounter,
} from "@/server/services/tabs";
import {
  createRazorpayOrder as customerCreateRazorpayOrder,
  verifyRazorpayPayment as customerVerifyRazorpayPayment,
  createUpiQrPayment,
  getPaymentStatus,
  verifyTestUpiPayment,
  switchOrderToCounter,
} from "@/server/services/customer";
import { recordCounterPayment } from "@/server/services/billing";
import { cancelOrder } from "@/server/services/manager";
import { POST as razorpayWebhookPost } from "@/app/api/webhooks/razorpay/route";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { verifyRazorpayWebhookSignature } from "@/server/razorpay";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
    APP_URL: "http://localhost:3000",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
    PAYMENTS_MODE: "online",
    RAZORPAY_KEY_ID: "rzp_test_mock_key",
    RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
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
  verifyRazorpayWebhookSignature: vi.fn().mockReturnValue(true),
  isOnlinePaymentsEnabled: vi.fn().mockReturnValue(true),
  isRazorpayTestMode: vi.fn().mockReturnValue(true),
  createRazorpayQrCode: vi.fn().mockResolvedValue(null),
  fetchRazorpayQrCode: vi.fn(),
  fetchRazorpayQrCodePayments: vi.fn().mockResolvedValue([]),
  fetchRazorpayOrder: vi.fn(),
}));

vi.mock("@/server/db", () => {
  const mockDb = {
    query: {
      payments: {
        findFirst: vi.fn(),
      },
      diningSessions: {
        findFirst: vi.fn(),
      },
      orders: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      tables: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        query: {
          orders: { findMany: vi.fn().mockResolvedValue([]) },
          diningSessions: { findFirst: vi.fn().mockResolvedValue(null) },
        },
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(undefined),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockResolvedValue(undefined),
        }),
      };
      return cb(mockTx);
    }),
  };
  return { db: mockDb };
});

describe("Tab Double Billing Prevention (Task T1)", () => {
  const mockRestaurant = {
    id: "rest-1",
    name: "Masala Lane",
    currency: "INR",
  };

  const mockTable = {
    id: "tbl-1",
    restaurantId: "rest-1",
    tableNumber: "T-01",
    qrToken: "table-1-token",
    isActive: true,
    restaurant: mockRestaurant,
  };

  const mockActiveSession = {
    id: "session-1",
    restaurantId: "rest-1",
    tableId: "tbl-1",
    status: "active",
    paymentStatus: "open",
    subtotalPaise: 50000,
    taxPaise: 2500,
    totalPaise: 52500,
    createdAt: new Date(),
  };

  const mockTabRoundOrder = {
    id: "ord-round-5",
    orderNumber: "ML-0039",
    diningSessionId: "session-1",
    roundNumber: 5,
    restaurantId: "rest-1",
    tableId: "tbl-1",
    status: "placed" as const,
    paymentStatus: "counter",
    paymentMethod: "counter",
    subtotalPaise: 30000,
    taxPaise: 1500,
    totalPaise: 31500,
    table: mockTable,
    diningSession: mockActiveSession,
    payments: [],
  };

  const managerActor = {
    userId: "usr-mgr",
    restaurantId: "rest-1",
    role: "manager",
    username: "chef_manager",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rule 1: Tab round cannot be paid individually", () => {
    it("rejects admin mark-paid action with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        actor: managerActor,
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await recordCounterPayment(mockCtx, {
        orderId: "ord-round-5",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects customer createRazorpayOrder on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await customerCreateRazorpayOrder(mockCtx, {
        orderId: "ord-round-5",
        token: "table-1-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects customer verifyRazorpayPayment on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await customerVerifyRazorpayPayment(mockCtx, {
        orderId: "ord-round-5",
        token: "table-1-token",
        razorpayOrderId: "order_rzp_123",
        razorpayPaymentId: "pay_rzp_123",
        razorpaySignature: "sig_123",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects customer createUpiQrPayment on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await createUpiQrPayment(mockCtx, {
        orderId: "ord-round-5",
        token: "table-1-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects customer getPaymentStatus on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getPaymentStatus(mockCtx, {
        orderId: "ord-round-5",
        token: "table-1-token",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects customer verifyTestUpiPayment on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const origDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = "postgres://localhost:5432/dinepulse_test";

      try {
        const mockCtx = {
          db: {
            query: {
              orders: {
                findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
              },
              diningSessions: {
                findFirst: vi.fn().mockResolvedValue(mockActiveSession),
              },
            },
          },
        } as unknown as Ctx;

        const res = await verifyTestUpiPayment(mockCtx, {
          orderId: "ord-round-5",
          token: "table-1-token",
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
          expect(res.status).toBe(400);
        }
      } finally {
        if (origDbUrl !== undefined) {
          process.env.DATABASE_URL = origDbUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
      }
    });

    it("rejects customer switchOrderToCounter on a tab round with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      const mockCtx = {
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(mockTabRoundOrder),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(mockActiveSession),
            },
          },
        },
      } as unknown as Ctx;

      const res = await switchOrderToCounter(mockCtx, {
        orderId: "ord-round-5",
        token: "table-1-token",
        targetMethod: "counter",
      });

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("TAB_ROUND_NOT_PAYABLE");
        expect(res.status).toBe(400);
      }
    });

    it("rejects Razorpay webhook on individual order belonging to open tab with TAB_ROUND_NOT_PAYABLE (400)", async () => {
      vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay-ind-1",
        orderId: "ord-round-5",
        diningSessionId: null, // individual order payment, not tab-level payment
        restaurantId: "rest-1",
        amountPaise: 31500,
        status: "pending",
        order: {
          id: "ord-round-5",
          diningSessionId: "session-1",
          orderNumber: "ML-0039",
          totalPaise: 31500,
          status: "placed",
          paymentStatus: "counter",
          table: mockTable,
          diningSession: mockActiveSession,
        },
      } as never);

      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_test_single",
              order_id: "order_rzp_single",
              amount: 31500,
              currency: "INR",
              status: "captured",
            },
          },
        },
      };

      const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        headers: {
          "x-razorpay-signature": "valid_signature",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const res = await razorpayWebhookPost(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("TAB_ROUND_NOT_PAYABLE");
    });
  });

  describe("Rule 2: Settling tab marks every round paid with one method", () => {
    it("settles tab online via verifyTabPayment and marks all rounds paid with 'pay_now'", async () => {
      const rounds = [
        { id: "ord-1", roundNumber: 1, totalPaise: 50000, status: "served", paymentStatus: "counter" },
        { id: "ord-2", roundNumber: 2, totalPaise: 30000, status: "served", paymentStatus: "counter" },
        { id: "ord-3", roundNumber: 3, totalPaise: 20000, status: "placed", paymentStatus: "counter" },
      ];

      const sessionWithRounds = {
        ...mockActiveSession,
        totalPaise: 100000,
        orders: rounds,
      };

      const updateOrderSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const updateSessionSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const updatePaymentSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
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
              findFirst: vi.fn().mockResolvedValue(sessionWithRounds),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              update: () => {
                return {
                  set: vi.fn((data: Record<string, unknown>) => {
                    if (data.status === "closed" && data.paymentMethod === "pay_now") {
                      return updateSessionSpy(data);
                    }
                    if (data.paymentStatus === "paid" && data.paymentMethod === "pay_now") {
                      return updateOrderSpy(data);
                    }
                    return updatePaymentSpy(data);
                  }),
                };
              },
              insert: insertSpy,
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await verifyTabPayment(mockCtx, {
        token: "table-1-token",
        razorpayOrderId: "order_rzp_mock_123",
        razorpayPaymentId: "pay_rzp_mock_456",
        razorpaySignature: "sig_mock_789",
      });

      expect(res.ok).toBe(true);
      // Verify orders were updated with paymentStatus: paid and paymentMethod: pay_now
      expect(updateOrderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: "paid",
          paymentMethod: "pay_now",
        })
      );
      // Verify session was closed with paymentMethod: pay_now
      expect(updateSessionSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "closed",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
        })
      );
    });

    it("settles tab at counter and marks all rounds paid with consistent method and no per-round payment rows", async () => {
      const rounds = [
        { id: "ord-1", roundNumber: 1, totalPaise: 40000, status: "served", paymentStatus: "counter" },
        { id: "ord-2", roundNumber: 2, totalPaise: 30000, status: "served", paymentStatus: "counter" },
      ];

      const sessionWithRounds = {
        ...mockActiveSession,
        totalPaise: 70000,
        orders: rounds,
        table: mockTable,
      };

      const updateOrderSpy = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      const paymentInsertedRows: Array<{ diningSessionId?: string; amountPaise?: number; provider?: string }> = [];
      const insertPaymentSpy = vi.fn((vals: { diningSessionId?: string; amountPaise?: number; provider?: string }) => {
        paymentInsertedRows.push(vals);
        return Promise.resolve(undefined);
      });

      const mockCtx = {
        actor: managerActor,
        db: {
          query: {
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(sessionWithRounds),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              update: () => ({
                set: vi.fn((data: Record<string, unknown>) => {
                  if (data.paymentStatus === "paid" && data.paymentMethod === "cash") {
                    updateOrderSpy(data);
                  }
                  return { where: vi.fn().mockResolvedValue(undefined) };
                }),
              }),
              insert: () => ({
                values: vi.fn((vals: { diningSessionId?: string; amountPaise?: number; provider?: string }) => {
                  if (vals.diningSessionId) {
                    insertPaymentSpy(vals);
                  }
                  return Promise.resolve(undefined);
                }),
              }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await settleTabAtCounter(mockCtx, {
        tabId: "session-1",
        paymentMethod: "cash",
      });

      expect(res.ok).toBe(true);
      // Verify orders were updated with the same method
      expect(updateOrderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentStatus: "paid",
          paymentMethod: "cash",
        })
      );
      // Verify exactly ONE payment row created for the consolidated tab
      expect(paymentInsertedRows.length).toBe(1);
      expect(paymentInsertedRows[0].diningSessionId).toBe("session-1");
      expect(paymentInsertedRows[0].amountPaise).toBe(70000);
      expect(paymentInsertedRows[0].provider).toBe("cash");
    });
  });

  describe("Rule 3: Tab total equals the sum of its non-cancelled rounds", () => {
    it("dynamically sums non-cancelled rounds and excludes cancelled rounds in getActiveTab", async () => {
      const sessionWithRounds = {
        ...mockActiveSession,
        subtotalPaise: 90000,
        taxPaise: 4500,
        totalPaise: 94500,
        orders: [
          {
            id: "ord-1",
            orderNumber: "ML-1001",
            roundNumber: 1,
            status: "served",
            paymentStatus: "counter",
            subtotalPaise: 40000,
            taxPaise: 2000,
            totalPaise: 42000,
            createdAt: new Date(),
            items: [],
          },
          {
            id: "ord-2",
            orderNumber: "ML-1002",
            roundNumber: 2,
            status: "served",
            paymentStatus: "counter",
            subtotalPaise: 30000,
            taxPaise: 1500,
            totalPaise: 31500,
            createdAt: new Date(),
            items: [],
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
              findFirst: vi.fn().mockResolvedValue(sessionWithRounds),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getActiveTab(mockCtx, "table-1-token");
      expect(res.ok).toBe(true);
      if (res.ok && res.data) {
        // 42000 + 31500 = 73500
        expect(res.data.totalPaise).toBe(73500);
        expect(res.data.subtotalPaise).toBe(70000);
        expect(res.data.taxPaise).toBe(3500);
        expect(res.data.formattedTotal).toBe("₹735");
      }
    });

    it("cancelOrder updates the tab total to exclude the cancelled round", async () => {
      const orderToCancel = {
        id: "ord-cancel-target",
        orderNumber: "ML-0099",
        restaurantId: "rest-1",
        diningSessionId: "session-1",
        status: "placed",
        paymentStatus: "counter",
        totalPaise: 31500,
        subtotalPaise: 30000,
        taxPaise: 1500,
        table: mockTable,
        payments: [],
      };

      const remainingOrders = [
        {
          id: "ord-keep-1",
          subtotalPaise: 50000,
          taxPaise: 2500,
          totalPaise: 52500,
          status: "placed",
        },
      ];

      const updatedSessionValues: Array<{ totalPaise?: number; subtotalPaise?: number; taxPaise?: number }> = [];

      const mockCtx = {
        actor: managerActor,
        db: {
          query: {
            orders: {
              findFirst: vi.fn().mockResolvedValue(orderToCancel),
            },
          },
          transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              query: {
                orders: {
                  findMany: vi.fn().mockResolvedValue(remainingOrders),
                },
              },
              update: () => ({
                set: vi.fn((vals: { totalPaise?: number; subtotalPaise?: number; taxPaise?: number }) => {
                  if (vals.totalPaise !== undefined) {
                    updatedSessionValues.push(vals);
                  }
                  return { where: vi.fn().mockResolvedValue(undefined) };
                }),
              }),
              insert: () => ({ values: vi.fn().mockResolvedValue(undefined) }),
            };
            return cb(tx);
          }),
        },
      } as unknown as Ctx;

      const res = await cancelOrder(mockCtx, {
        orderId: "ord-cancel-target",
        reason: "Customer changed mind",
      });

      expect(res.ok).toBe(true);
      expect(updatedSessionValues.length).toBeGreaterThan(0);
      // New total should equal only remaining order: 52500
      expect(updatedSessionValues[0].totalPaise).toBe(52500);
      expect(updatedSessionValues[0].subtotalPaise).toBe(50000);
      expect(updatedSessionValues[0].taxPaise).toBe(2500);
    });
  });

  describe("Rule 4: Pre-paid round is excluded from amount due", () => {
    it("excludes a pre-paid round from amount due and shows it as already paid", async () => {
      const rounds = [
        {
          id: "ord-prepaid",
          orderNumber: "ML-0001",
          roundNumber: 1,
          status: "served",
          paymentStatus: "paid", // Pre-paid round
          subtotalPaise: 40000,
          taxPaise: 2000,
          totalPaise: 42000,
          createdAt: new Date(),
          items: [],
        },
        {
          id: "ord-unpaid-2",
          orderNumber: "ML-0002",
          roundNumber: 2,
          status: "served",
          paymentStatus: "counter", // Unpaid round
          subtotalPaise: 30000,
          taxPaise: 1500,
          totalPaise: 31500,
          createdAt: new Date(),
          items: [],
        },
      ];

      const session = {
        ...mockActiveSession,
        subtotalPaise: 70000,
        taxPaise: 3500,
        totalPaise: 73500,
        orders: rounds,
      };

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(session),
            },
          },
        },
      } as unknown as Ctx;

      const res = await getActiveTab(mockCtx, "table-1-token");
      expect(res.ok).toBe(true);
      if (res.ok && res.data) {
        // Tab total is 42000 + 31500 = 73500 (₹735)
        expect(res.data.totalPaise).toBe(73500);
        expect(res.data.formattedTotal).toBe("₹735");
        // Pre-paid amount is 42000
        expect(res.data.paidPaise).toBe(42000);
        // Amount due is 31500 (₹315)
        expect(res.data.amountDuePaise).toBe(31500);
        expect(res.data.formattedAmountDue).toBe("₹315");

        // The orders list identifies the pre-paid round
        const r1 = res.data.orders.find((o) => o.roundNumber === 1);
        expect(r1?.paymentStatus).toBe("paid");
      }
    });

    it("charges only the amount due when creating online Razorpay order with a pre-paid round", async () => {
      const rounds = [
        {
          id: "ord-prepaid-1",
          roundNumber: 1,
          totalPaise: 50000,
          status: "served",
          paymentStatus: "paid", // ₹500 already paid
        },
        {
          id: "ord-unpaid-2",
          roundNumber: 2,
          totalPaise: 30000,
          status: "served",
          paymentStatus: "counter", // ₹300 unpaid
        },
      ];

      const session = {
        ...mockActiveSession,
        totalPaise: 80000,
        orders: rounds,
      };

      let recordedPaymentAmount: number | null = null;

      const mockCtx = {
        db: {
          query: {
            tables: {
              findFirst: vi.fn().mockResolvedValue(mockTable),
            },
            diningSessions: {
              findFirst: vi.fn().mockResolvedValue(session),
            },
          },
          insert: vi.fn().mockReturnValue({
            values: vi.fn((vals: { amountPaise: number }) => {
              recordedPaymentAmount = vals.amountPaise;
              return Promise.resolve(undefined);
            }),
          }),
        },
      } as unknown as Ctx;

      const res = await createTabRazorpayOrder(mockCtx, "table-1-token");
      expect(res.ok).toBe(true);
      if (res.ok) {
        // Amount charged must be 30000 (₹300), NOT 80000!
        expect(res.data.amountPaise).toBe(30000);
        expect(recordedPaymentAmount).toBe(30000);
      }
    });
  });
});
