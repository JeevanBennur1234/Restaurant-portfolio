import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db";
import { POST as razorpayWebhookPost } from "@/app/api/webhooks/razorpay/route";
import { verifyRazorpayWebhookSignature } from "@/server/razorpay";

vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
    PAYMENTS_MODE: "online",
    RAZORPAY_WEBHOOK_SECRET: "mock-secret",
  },
}));

vi.mock("@/server/razorpay", () => ({
  verifyRazorpayWebhookSignature: vi.fn(() => true),
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      payments: { findFirst: vi.fn() },
      diningSessions: { findFirst: vi.fn() },
    },
    transaction: vi.fn(),
  },
}));

describe("Razorpay consolidated tab webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("settles the saved tab amount rather than comparing it to the representative round total", async () => {
    const table = { id: "table-1", tableNumber: "1" };
    const session = {
      id: "session-1",
      restaurantId: "rest-1",
      tableId: "table-1",
      status: "bill_requested",
      paymentStatus: "bill_requested",
      paymentMethod: "pay_now",
      table,
      subtotalPaise: 50000,
      taxPaise: 2500,
      totalPaise: 52500,
      orders: [
        {
          id: "round-1",
          orderNumber: "ML-0034",
          diningSessionId: "session-1",
          status: "served",
          paymentStatus: "counter",
          paymentMethod: "counter",
          subtotalPaise: 23810,
          taxPaise: 1190,
          totalPaise: 25000,
          payments: [],
        },
        {
          id: "round-2",
          orderNumber: "ML-0035",
          diningSessionId: "session-1",
          status: "ready",
          paymentStatus: "counter",
          paymentMethod: "counter",
          subtotalPaise: 26190,
          taxPaise: 1310,
          totalPaise: 27500,
          payments: [],
        },
      ],
    };
    vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);
    vi.mocked(db.query.payments.findFirst).mockResolvedValue({
      id: "tab-payment-1",
      orderId: "round-1",
      diningSessionId: "session-1",
      restaurantId: "rest-1",
      razorpayOrderId: "rzp-tab-order-1",
      amountPaise: 52500,
      status: "pending",
      order: {
        id: "round-1",
        diningSessionId: "session-1",
        orderNumber: "ML-0034",
        totalPaise: 25000,
        status: "served",
        paymentStatus: "counter",
        table,
        diningSession: session,
      },
    } as never);
    vi.mocked(db.query.diningSessions.findFirst).mockResolvedValue(session as never);

    const updatedValues: Array<Record<string, unknown>> = [];
    const transaction = async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        update: vi.fn(() => {
          let values: Record<string, unknown> = {};
          return {
            set: vi.fn((nextValues: Record<string, unknown>) => {
              values = nextValues;
              return {
                where: vi.fn(() => {
                  const result = Promise.resolve(undefined) as Promise<unknown> & {
                    returning: ReturnType<typeof vi.fn>;
                  };
                  result.returning = vi.fn().mockResolvedValue(
                    values.status === "closed" ? [{ id: "session-1" }] : []
                  );
                  updatedValues.push(values);
                  return result;
                }),
              };
            }),
          };
        }),
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(undefined),
        })),
      };
      return callback(tx);
    };
    vi.mocked(db.transaction).mockImplementationOnce(transaction as never);

    const req = new NextRequest("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": "valid-signature",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay-tab-1",
              order_id: "rzp-tab-order-1",
              amount: 52500,
              currency: "INR",
              status: "captured",
            },
          },
        },
      }),
    });

    const res = await razorpayWebhookPost(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("processed_tab");
    expect(updatedValues).toContainEqual(expect.objectContaining({
      status: "closed",
      paymentMethod: "pay_now",
      totalPaise: 52500,
    }));
    expect(updatedValues).toContainEqual(expect.objectContaining({
      paymentStatus: "paid",
      paymentMethod: "pay_now",
    }));
  });
});
