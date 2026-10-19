import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/server/env", () => ({
  env: {
    DEMO_MODE: "true",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-secret-at-least-32-characters-long",
    RAZORPAY_KEY_ID: "rzp_test_placeholder",
    RAZORPAY_KEY_SECRET: "rzp_test_placeholder",
    RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/razorpay", () => ({
  verifyRazorpaySignature: vi.fn(),
  verifyRazorpayWebhookSignature: vi.fn(),
  createRazorpayOrder: vi.fn(),
  isRazorpayConfigured: vi.fn().mockReturnValue(false),
}));

vi.mock("@/server/db", () => {
  return {
    db: {
      query: {
        orders: {
          findFirst: vi.fn(),
        },
        payments: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
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
    },
  };
});

import { env } from "@/server/env";
import { db } from "@/server/db";
import {
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
} from "@/server/razorpay";
import {
  verifyRazorpayPayment,
} from "@/server/services/customer";
import { POST as razorpayWebhookPost } from "@/app/api/webhooks/razorpay/route";
import { NextRequest } from "next/server";

describe("Payment Security & Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.DEMO_MODE = "true";
  });

  describe("Requirement 1: verifyRazorpayPaymentAction pairing & amount checks", () => {
    it("rejects when order and payment pairing does not match (payment not found for order)", async () => {
      // Valid signature
      vi.mocked(verifyRazorpaySignature).mockReturnValue(true);

      // Order exists with matching token
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_123",
        restaurantId: "rest_1",
        totalPaise: 50000,
        orderNumber: "ML-1001",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-7" },
      } as never);

      // No payment record matching orderId AND razorpayOrderId
      vi.mocked(db.query.payments.findFirst).mockResolvedValue(null as never);

      const result = await verifyRazorpayPayment(
        { db },
        {
          orderId: "order_123",
          token: "valid_token",
          razorpayOrderId: "order_rzp_wrong_pairing",
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "valid_hmac_signature",
        }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("Payment record not found for this order");
      }
    });

    it("rejects when payment amount does not equal order total paise", async () => {
      vi.mocked(verifyRazorpaySignature).mockReturnValue(true);

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_123",
        restaurantId: "rest_1",
        totalPaise: 50000, // 500.00 INR
        orderNumber: "ML-1001",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-7" },
      } as never);

      // Payment row has mismatched amount (e.g. tampered 1000 paise instead of 50000)
      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_row_1",
        orderId: "order_123",
        razorpayOrderId: "order_rzp_123",
        amountPaise: 1000, // MISMATCH
        status: "pending",
      } as never);

      const result = await verifyRazorpayPayment(
        { db },
        {
          orderId: "order_123",
          token: "valid_token",
          razorpayOrderId: "order_rzp_123",
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "valid_hmac_signature",
        }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("Payment amount mismatch");
      }
    });

    it("succeeds and performs idempotent update when valid", async () => {
      vi.mocked(verifyRazorpaySignature).mockReturnValue(true);

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_123",
        restaurantId: "rest_1",
        totalPaise: 50000,
        orderNumber: "ML-1001",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-7" },
      } as never);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_row_1",
        orderId: "order_123",
        razorpayOrderId: "order_rzp_123",
        amountPaise: 50000,
        status: "pending",
      } as never);

      const result = await verifyRazorpayPayment(
        { db },
        {
          orderId: "order_123",
          token: "valid_token",
          razorpayOrderId: "order_rzp_123",
          razorpayPaymentId: "pay_test_123",
          razorpaySignature: "valid_hmac_signature",
        }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.paymentStatus).toBe("paid");
      }
      expect(db.transaction).toHaveBeenCalled();
    });
  });

  describe("Requirement 5: Webhook amount verification", () => {
    it("rejects webhook when payload amount mismatches payments.amount_paise", async () => {
      vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_row_1",
        orderId: "order_123",
        restaurantId: "rest_1",
        amountPaise: 50000,
        status: "pending",
        order: {
          id: "order_123",
          orderNumber: "ML-1001",
          totalPaise: 50000,
          status: "placed",
          createdAt: new Date(),
          table: { tableNumber: "T-7" },
        },
      } as never);

      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_123",
              order_id: "order_rzp_123",
              amount: 25000, // Mismatched: 25000 vs expected 50000
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
      expect(data.error).toBe("Payment amount mismatch");
    });
  });
});
