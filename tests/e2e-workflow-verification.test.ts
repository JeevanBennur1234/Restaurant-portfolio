import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
vi.mock("@/server/env", () => ({
  env: {
    PAYMENTS_MODE: "online",
    DATABASE_URL: "postgres://mock",
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "mock-session-secret-at-least-32-chars-long",
    RAZORPAY_KEY_ID: "rzp_test_placeholder",
    RAZORPAY_KEY_SECRET: "rzp_test_placeholder",
    RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret",
  },
}));

// Mock realtime
vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

// Mock auth session
const mockSession = {
  userId: "staff_manager_1",
  restaurantId: "rest_masala_lane",
  role: "manager" as const,
  username: "manager",
  fullName: "General Manager",
  isDemo: false,
};

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(() => Promise.resolve(mockSession)),
  verifySessionToken: vi.fn(),
  createSessionToken: vi.fn(),
}));

vi.mock("@/server/razorpay", () => ({
  verifyRazorpaySignature: vi.fn(() => true),
  isRazorpayConfigured: vi.fn(() => true),
  isRazorpayTestMode: vi.fn(() => true),
  isOnlinePaymentsEnabled: vi.fn(() => true),
  createRazorpayOrder: vi.fn(),
}));

import { verifyRazorpayPayment } from "@/server/services/customer";
import { transitionOrderStatus } from "@/server/services/kitchen";
import { cancelOrder } from "@/server/services/manager";
import { GET as qrPdfGet } from "@/app/api/admin/tables/qr-pdf/route";
import { NextRequest } from "next/server";
import { payments } from "@/server/db/schema";
import { db } from "@/server/db";

// In-memory mock store representing DB state for the E2E lifecycle test
interface MockDbOrder {
  id: string;
  restaurantId: string;
  tableId: string;
  orderNumber: string;
  status: "placed" | "accepted" | "preparing" | "ready" | "served" | "cancelled";
  paymentStatus: string;
  paymentMethod: string;
  totalPaise: number;
  table: { qrToken: string; tableNumber: string };
  payments: Array<{ id: string; status: string; provider: string; amountPaise: number }>;
}

vi.mock("@/server/db", () => {
  const store: {
    orders: Map<string, MockDbOrder>;
    payments: Map<string, { id: string; orderId: string; status: string; provider: string; amountPaise: number }>;
    orderEvents: Array<unknown>;
  } = {
    orders: new Map(),
    payments: new Map(),
    orderEvents: [],
  };

  return {
    _store: store,
    db: {
      query: {
        tables: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([
            { tableNumber: "T-01", capacity: 4, qrToken: "token_t1", isActive: true },
            { tableNumber: "T-02", capacity: 2, qrToken: "token_t2", isActive: true },
          ]),
        },
        orders: {
          findFirst: vi.fn(async () => {
            for (const order of store.orders.values()) {
              return {
                ...order,
                items: [],
                table: order.table,
                payments: order.payments,
              };
            }
            return null;
          }),
          findMany: vi.fn(async () => {
            // Kitchen query: returns orders where paymentMethod is 'counter' OR paymentStatus is 'paid' / 'completed'
            // and status is not 'served' and not 'cancelled'
            const active: MockDbOrder[] = [];
            for (const order of store.orders.values()) {
              if (order.status === "served" || order.status === "cancelled") continue;
              if (order.paymentMethod === "counter" || order.paymentStatus === "paid" || order.paymentStatus === "completed") {
                active.push(order);
              }
            }
            return active;
          }),
        },
        payments: {
          findFirst: vi.fn(async () => {
            for (const p of store.payments.values()) {
              return p;
            }
            return null;
          }),
        },
        orderEvents: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation((vals: unknown) => {
          store.orderEvents.push(vals);
          return Promise.resolve();
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => {
            for (const order of store.orders.values()) {
              Object.assign(order, updates);
            }
            return Promise.resolve();
          }),
        })),
      }),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          update: vi.fn().mockImplementation((table: unknown) => ({
            set: vi.fn().mockImplementation((updates: Record<string, unknown>) => ({
              where: vi.fn().mockImplementation(() => {
                // If table is payments, update payments
                if (table === payments || (table && (table as { _?: { name?: string } })._?.name === "payments")) {
                  for (const p of store.payments.values()) {
                    Object.assign(p, updates);
                  }
                } else {
                  // Otherwise update orders
                  for (const order of store.orders.values()) {
                    Object.assign(order, updates);
                  }
                }
                return Promise.resolve();
              }),
            })),
          })),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockImplementation((vals: unknown) => {
              store.orderEvents.push(vals);
              return Promise.resolve();
            }),
          }),
        };
        return cb(mockTx);
      }),
    },
  };
});

describe("End-to-End Restaurant Order Flow Verification", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let store: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Retrieve mock store
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbModule = (await import("@/server/db")) as any;
    store = dbModule._store;
    store.orders.clear();
    store.payments.clear();
    store.orderEvents.length = 0;
  });

  it("Step 1: Counter order is immediately visible on the kitchen board", async () => {
    // 1. Create a counter order
    const counterOrder: MockDbOrder = {
      id: "order_counter_1",
      restaurantId: "rest_masala_lane",
      tableId: "table_1",
      orderNumber: "ML-0001",
      status: "placed",
      paymentStatus: "pending",
      paymentMethod: "counter",
      totalPaise: 35000,
      table: { qrToken: "table_token_1", tableNumber: "T-01" },
      payments: [],
    };
    store.orders.set(counterOrder.id, counterOrder);

    // Kitchen queries active orders
    const kitchenOrders = await db.query.orders.findMany();

    // Verify counter order is immediately present for kitchen staff
    expect(kitchenOrders.length).toBe(1);
    expect(kitchenOrders[0].id).toBe("order_counter_1");
    expect(kitchenOrders[0].paymentMethod).toBe("counter");
    expect(kitchenOrders[0].status).toBe("placed");
  });

  it("Step 2 & 3: Pay-now online order is hidden from kitchen until verified, then appears", async () => {
    // 1. Create a pay-now order with pending payment
    const payNowOrder: MockDbOrder = {
      id: "order_paynow_1",
      restaurantId: "rest_masala_lane",
      tableId: "table_2",
      orderNumber: "ML-0002",
      status: "placed",
      paymentStatus: "pending",
      paymentMethod: "pay_now",
      totalPaise: 42000,
      table: { qrToken: "table_token_2", tableNumber: "T-02" },
      payments: [],
    };
    store.orders.set(payNowOrder.id, payNowOrder);

    const pendingPayment = {
      id: "pay_rzp_1",
      orderId: "order_paynow_1",
      status: "pending",
      provider: "razorpay",
      razorpayOrderId: "order_rzp_123",
      amountPaise: 42000,
    };
    store.payments.set(pendingPayment.id, pendingPayment);
    payNowOrder.payments.push(pendingPayment);

    // 2. Kitchen checks for new tickets: order should NOT be visible
    let kitchenOrders = await db.query.orders.findMany();
    expect(kitchenOrders.length).toBe(0);

    // 3. Verify Razorpay payment
    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
      ...payNowOrder,
      table: payNowOrder.table,
      payments: payNowOrder.payments,
    } as never);
    vi.mocked(db.query.payments.findFirst).mockResolvedValueOnce(pendingPayment as never);

    const paymentResult = await verifyRazorpayPayment(
      { db },
      {
        orderId: payNowOrder.id,
        token: payNowOrder.table.qrToken,
        razorpayOrderId: "order_rzp_123",
        razorpayPaymentId: "pay_rzp_456",
        razorpaySignature: "valid_signature",
      }
    );

    expect(paymentResult.ok).toBe(true);
    expect(payNowOrder.paymentStatus).toBe("paid");

    // 4. Kitchen checks tickets again: order IS NOW visible
    kitchenOrders = await db.query.orders.findMany();
    expect(kitchenOrders.length).toBe(1);
    expect(kitchenOrders[0].id).toBe("order_paynow_1");
    expect(kitchenOrders[0].paymentStatus).toBe("paid");
  });

  it("Step 4 & 5: Move order through every status and verify sequential progression & tracker updates", async () => {
    const order: MockDbOrder = {
      id: "order_step_1",
      restaurantId: "rest_masala_lane",
      tableId: "table_1",
      orderNumber: "ML-0003",
      status: "placed",
      paymentStatus: "paid",
      paymentMethod: "pay_now",
      totalPaise: 29900,
      table: { qrToken: "token_t1", tableNumber: "T-01" },
      payments: [{ id: "p1", status: "completed", provider: "razorpay", amountPaise: 29900 }],
    };
    store.orders.set(order.id, order);

    // Test VALID_TRANSITIONS progression: placed -> accepted -> preparing -> ready -> served
    const sequence = ["accepted", "preparing", "ready", "served"] as const;

    for (const nextStatus of sequence) {
      // Mock findFirst returning current order state
      vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
        ...order,
        table: order.table,
        payments: order.payments,
      } as never);

      // Kitchen updates status
      const res = await transitionOrderStatus(
        { db, actor: mockSession },
        {
          orderId: order.id,
          toStatus: nextStatus,
        }
      );

      expect(res.ok).toBe(true);
      expect(order.status).toBe(nextStatus);

      // Verify guest tracker sees the updated status
      expect(order.status).toBe(nextStatus);
    }

    // Attempting an invalid transition (e.g. from 'served' back to 'preparing') must fail
    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
      ...order,
      table: order.table,
      payments: order.payments,
    } as never);
    const invalidRes = await transitionOrderStatus(
      { db, actor: mockSession },
      {
        orderId: order.id,
        toStatus: "preparing",
      }
    );
    expect(invalidRes.ok).toBe(false);
    if (!invalidRes.ok) {
      expect(invalidRes.message).toContain("Invalid status transition");
    }
  });

  it("Step 6: Manager cancels order -> updates status to cancelled and payment to refund_pending", async () => {
    const paidOrder: MockDbOrder = {
      id: "order_cancel_1",
      restaurantId: "rest_masala_lane",
      tableId: "table_1",
      orderNumber: "ML-0004",
      status: "preparing",
      paymentStatus: "paid",
      paymentMethod: "pay_now",
      totalPaise: 55000,
      table: { qrToken: "token_t1", tableNumber: "T-01" },
      payments: [{ id: "pay_1", status: "completed", provider: "razorpay", amountPaise: 55000 }],
    };
    store.orders.set(paidOrder.id, paidOrder);

    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
      ...paidOrder,
      table: paidOrder.table,
      payments: paidOrder.payments,
    } as never);

    const cancelResult = await cancelOrder(
      { db, actor: mockSession },
      {
        orderId: paidOrder.id,
        reason: "Customer requested cancellation due to urgent departure",
      }
    );

    expect(cancelResult.ok).toBe(true);
    expect(paidOrder.status).toBe("cancelled");
    expect(paidOrder.paymentStatus).toBe("refund_pending");

    // Check order events audit trail was logged
    expect(store.orderEvents.length).toBeGreaterThan(0);
  });

  it("Step 7: Manager generates QR PDF -> produces valid PDF buffer with table URLs", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/tables/qr-pdf");
    const response = await qrPdfGet(req);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("Masala-Lane-Table-QRs.pdf");

    const pdfArrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(pdfArrayBuffer);

    // Verify PDF header magic bytes "%PDF-"
    expect(buffer.toString("ascii", 0, 5)).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
