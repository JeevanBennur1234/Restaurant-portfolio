import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before imports
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "development",
    PAYMENTS_MODE: "online",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-secret-at-least-32-characters-long",
    RAZORPAY_KEY_ID: "rzp_test_placeholder",
    RAZORPAY_KEY_SECRET: "rzp_test_placeholder",
    RAZORPAY_WEBHOOK_SECRET: "mock_webhook_secret",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
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
  verifyRazorpaySignature: vi.fn(),
  verifyRazorpayWebhookSignature: vi.fn(),
  createRazorpayOrder: vi.fn(),
  isRazorpayConfigured: vi.fn().mockReturnValue(true),
  isRazorpayTestMode: vi.fn().mockReturnValue(true),
  isOnlinePaymentsEnabled: vi.fn().mockReturnValue(true),
  createRazorpayQrCode: vi.fn(),
  fetchRazorpayQrCode: vi.fn(),
  fetchRazorpayQrCodePayments: vi.fn().mockResolvedValue([]),
  fetchRazorpayOrder: vi.fn(),
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
          query: {
            payments: {
              findFirst: vi.fn(),
            },
          },
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
  isRazorpayTestMode,
  createRazorpayQrCode,
  fetchRazorpayQrCode,
  fetchRazorpayQrCodePayments,
} from "@/server/razorpay";
import {
  verifyRazorpayPayment,
  createUpiQrPayment,
  getPaymentStatus,
  verifyTestUpiPayment,
} from "@/server/services/customer";
import { isIsolatedLocalTestDatabase } from "@/server/db/safe-test-db";
import { POST as razorpayWebhookPost } from "@/app/api/webhooks/razorpay/route";
import { NextRequest } from "next/server";

describe("Payment Security & Integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.PAYMENTS_MODE = "online";
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

    it("processes qr_code.credited webhook successfully when amount matches", async () => {
      vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_row_qr",
        orderId: "order_qr_123",
        restaurantId: "rest_1",
        amountPaise: 45000,
        status: "pending",
        razorpayOrderId: "qr_test_123456",
        order: {
          id: "order_qr_123",
          orderNumber: "ML-2001",
          totalPaise: 45000,
          status: "placed",
          createdAt: new Date(),
          table: { tableNumber: "T-2" },
        },
      } as never);

      const payload = {
        event: "qr_code.credited",
        payload: {
          qr_code: {
            entity: {
              id: "qr_test_123456",
              status: "closed",
              notes: {
                orderId: "order_qr_123",
              },
            },
          },
          payment: {
            entity: {
              id: "pay_upi_captured_123",
              amount: 45000,
              status: "captured",
              method: "upi",
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
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe("processed");
        expect(data.orderId).toBe("order_qr_123");
      });

      it("rejects webhook when incoming qr_code.credited QR ID does not match persisted payments.razorpayOrderId", async () => {
        vi.mocked(verifyRazorpayWebhookSignature).mockReturnValue(true);

        vi.mocked(db.query.payments.findFirst).mockResolvedValue({
          id: "pay_qr_sec_1",
          restaurantId: "rest_1",
          orderId: "order_qr_123",
          amountPaise: 45000,
          status: "pending",
          razorpayOrderId: "qr_persisted_correct_id",
          order: {
            id: "order_qr_123",
            orderNumber: "ML-2001",
            totalPaise: 45000,
            status: "placed",
            createdAt: new Date(),
            table: { tableNumber: "T-2" },
          },
        } as never);

        const payload = {
          event: "qr_code.credited",
          payload: {
            qr_code: {
              entity: {
                id: "qr_attacker_different_id",
                status: "closed",
                notes: {
                  orderId: "order_qr_123",
                },
              },
            },
            payment: {
              entity: {
                id: "pay_upi_captured_999",
                amount: 45000,
                currency: "INR",
                status: "captured",
                method: "upi",
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
        expect(data.error).toMatch(/QR code ID does not match persisted payment record/i);
      });
    });

    describe("Point 1: isIsolatedLocalTestDatabase Validation", () => {
      it("rejects empty, whitespace, or undefined URLs", () => {
        expect(isIsolatedLocalTestDatabase("").safe).toBe(false);
        expect(isIsolatedLocalTestDatabase("   ").safe).toBe(false);
        expect(isIsolatedLocalTestDatabase(undefined).safe).toBe(false);
      });

      it("rejects malformed URLs", () => {
        expect(isIsolatedLocalTestDatabase("not-a-valid-database-url").safe).toBe(false);
        expect(isIsolatedLocalTestDatabase("://invalid").safe).toBe(false);
      });

      it("rejects Supabase database hosts", () => {
        const res1 = isIsolatedLocalTestDatabase(
          "postgresql://postgres.xxx:pass@aws-0-ap-south-1.pooler.supabase.com:6543/dinepulse_e2e"
        );
        expect(res1.safe).toBe(false);
        expect(res1.reason).toMatch(/supabase/i);

        const res2 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:secret@db.supabase.co:5432/dinepulse_e2e"
        );
        expect(res2.safe).toBe(false);
        expect(res2.reason).toMatch(/supabase/i);
      });

      it("rejects remote cloud database hosts", () => {
        const res1 = isIsolatedLocalTestDatabase(
          "postgresql://user:pass@db.production.company.com:5432/dinepulse_e2e"
        );
        expect(res1.safe).toBe(false);
        expect(res1.reason).toMatch(/not recognized as a safe local test host/i);

        const res2 = isIsolatedLocalTestDatabase(
          "postgresql://user:pass@192.168.1.100:5432/dinepulse_e2e"
        );
        expect(res2.safe).toBe(false);
        expect(res2.reason).toMatch(/not recognized as a safe local test host/i);
      });

      it("rejects local non-test databases (fails closed for unrecognized database names)", () => {
        const res1 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:postgres@localhost:5432/dinepulse"
        );
        expect(res1.safe).toBe(false);
        expect(res1.reason).toMatch(/not in the test-database allowlist/i);

        const res2 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:postgres@127.0.0.1:5432/postgres"
        );
        expect(res2.safe).toBe(false);
        expect(res2.reason).toMatch(/not in the test-database allowlist/i);

        const res3 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:postgres@localhost:5432/my_restaurant"
        );
        expect(res3.safe).toBe(false);
        expect(res3.reason).toMatch(/not in the test-database allowlist/i);
      });

      it("allows safe local test databases in allowlist", () => {
        const res1 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e"
        );
        expect(res1.safe).toBe(true);
        expect(res1.host).toBe("localhost");
        expect(res1.database).toBe("dinepulse_e2e");

        const res2 = isIsolatedLocalTestDatabase(
          "postgresql://postgres:postgres@127.0.0.1:5432/dinepulse_test"
        );
        expect(res2.safe).toBe(true);
        expect(res2.database).toBe("dinepulse_test");

        const res3 = isIsolatedLocalTestDatabase("postgres://mock");
        expect(res3.safe).toBe(true);
        expect(res3.database).toBe("mock");
      });
    });

    describe("Requirement 6: UPI QR & Test Verification", () => {
      it("rejects verifyTestUpiPayment when not in Razorpay test mode", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(false);

        const result = await verifyTestUpiPayment(
          { db },
          { orderId: "order_123", token: "valid_token" }
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(403);
          expect(result.message).toMatch(/only permitted in Razorpay Test Mode/i);
        }
      });

      it("rejects verifyTestUpiPayment in production even if RAZORPAY_KEY_ID begins with rzp_test_", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        vi.stubEnv("NODE_ENV", "production");
        env.NODE_ENV = "production";

        try {
          const result = await verifyTestUpiPayment(
            { db },
            { orderId: "order_123", token: "valid_token" }
          );

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.message).toMatch(/strictly prohibited in production/i);
          }
        } finally {
          vi.unstubAllEnvs();
          env.NODE_ENV = "development";
        }
      });

      it("rejects verifyTestUpiPayment when ALLOW_TEST_PAYMENT_SIMULATION is missing or false", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        const originalOptIn = process.env.ALLOW_TEST_PAYMENT_SIMULATION;
        const originalEnvOptIn = env.ALLOW_TEST_PAYMENT_SIMULATION;
        process.env.ALLOW_TEST_PAYMENT_SIMULATION = "false";
        env.ALLOW_TEST_PAYMENT_SIMULATION = "false";

        try {
          const result = await verifyTestUpiPayment(
            { db },
            { orderId: "order_123", token: "valid_token" }
          );

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.message).toMatch(/ALLOW_TEST_PAYMENT_SIMULATION must be set to 'true'/i);
          }
        } finally {
          process.env.ALLOW_TEST_PAYMENT_SIMULATION = originalOptIn;
          env.ALLOW_TEST_PAYMENT_SIMULATION = originalEnvOptIn;
        }
      });

      it("rejects verifyTestUpiPayment on a local non-test database (e.g. dinepulse)", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        const originalDbUrl = process.env.DATABASE_URL;
        const originalEnvDbUrl = env.DATABASE_URL;
        const nonTestDbUrl = "postgresql://postgres:postgres@localhost:5432/dinepulse";
        process.env.DATABASE_URL = nonTestDbUrl;
        env.DATABASE_URL = nonTestDbUrl;

        try {
          const result = await verifyTestUpiPayment(
            { db },
            { orderId: "order_123", token: "valid_token" }
          );

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.message).toMatch(/not in the test-database allowlist/i);
          }
        } finally {
          process.env.DATABASE_URL = originalDbUrl;
          env.DATABASE_URL = originalEnvDbUrl;
        }
      });

      it("rejects verifyTestUpiPayment when DATABASE_URL points to Supabase", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        const originalDbUrl = process.env.DATABASE_URL;
        const originalEnvDbUrl = env.DATABASE_URL;
        const supabaseUrl = "postgresql://postgres.xxx:secret@aws-0-ap-south-1.pooler.supabase.com:6543/dinepulse_e2e";
        process.env.DATABASE_URL = supabaseUrl;
        env.DATABASE_URL = supabaseUrl;

        try {
          const result = await verifyTestUpiPayment(
            { db },
            { orderId: "order_123", token: "valid_token" }
          );

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.message).toMatch(/supabase/i);
          }
        } finally {
          process.env.DATABASE_URL = originalDbUrl;
          env.DATABASE_URL = originalEnvDbUrl;
        }
      });

      it("rejects verifyTestUpiPayment when DATABASE_URL points to a remote host", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        const originalDbUrl = process.env.DATABASE_URL;
        const originalEnvDbUrl = env.DATABASE_URL;
        const remoteDbUrl = "postgresql://user:secret@db.remote-prod.com:5432/dinepulse_e2e";
        process.env.DATABASE_URL = remoteDbUrl;
        env.DATABASE_URL = remoteDbUrl;

        try {
          const result = await verifyTestUpiPayment(
            { db },
            { orderId: "order_123", token: "valid_token" }
          );

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.status).toBe(403);
            expect(result.message).toMatch(/not recognized as a safe local test host/i);
          }
        } finally {
          process.env.DATABASE_URL = originalDbUrl;
          env.DATABASE_URL = originalEnvDbUrl;
        }
      });

      it("rejects verifyTestUpiPayment when table token does not match order", async () => {
        vi.mocked(isRazorpayTestMode).mockReturnValue(true);
        vi.stubEnv("NODE_ENV", "development");
        env.NODE_ENV = "development";
        process.env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
        env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
        env.DATABASE_URL = "postgres://mock";
        delete process.env.DATABASE_URL;

        vi.mocked(db.query.orders.findFirst).mockResolvedValue({
          id: "order_123",
          restaurantId: "rest_1",
          totalPaise: 35000,
          orderNumber: "ML-3001",
          status: "placed",
          paymentStatus: "pending",
          createdAt: new Date(),
          table: { qrToken: "table_token_real", tableNumber: "T-3" },
        } as never);

        const result = await verifyTestUpiPayment(
          { db },
          { orderId: "order_123", token: "wrong_table_token" }
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.status).toBe(403);
          expect(result.message).toMatch(/unauthorized/i);
        }
      });

    it("allows verifyTestUpiPayment when all 4 security gates pass and marks order as paid", async () => {
      vi.mocked(isRazorpayTestMode).mockReturnValue(true);
      vi.stubEnv("NODE_ENV", "development");
      env.NODE_ENV = "development";
      process.env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
      env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
      env.DATABASE_URL = "postgres://mock";
      delete process.env.DATABASE_URL;

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_123",
        restaurantId: "rest_1",
        totalPaise: 35000,
        orderNumber: "ML-3001",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-3" },
      } as never);

      const result = await verifyTestUpiPayment(
        { db },
        { orderId: "order_123", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.paymentStatus).toBe("paid");
      }
      expect(db.transaction).toHaveBeenCalled();
    });

    it("idempotently returns success when order is already paid in verifyTestUpiPayment", async () => {
      vi.mocked(isRazorpayTestMode).mockReturnValue(true);
      vi.stubEnv("NODE_ENV", "development");
      env.NODE_ENV = "development";
      process.env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
      env.ALLOW_TEST_PAYMENT_SIMULATION = "true";
      env.DATABASE_URL = "postgres://mock";
      delete process.env.DATABASE_URL;

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_already_paid",
        restaurantId: "rest_1",
        totalPaise: 35000,
        orderNumber: "ML-3001",
        status: "placed",
        paymentStatus: "paid",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-3" },
      } as never);

      const result = await verifyTestUpiPayment(
        { db },
        { orderId: "order_already_paid", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.paymentStatus).toBe("paid");
      }
      // Should not re-run transaction for already paid order
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("createUpiQrPayment returns genuine QR when Razorpay QR API succeeds", async () => {
      vi.mocked(isRazorpayTestMode).mockReturnValue(false);
      vi.mocked(createRazorpayQrCode).mockResolvedValue({
        id: "qr_real_12345",
        entity: "qr_code",
        name: "Order ML-4001",
        usage: "single_use",
        type: "upi_qr",
        status: "active",
        imageUrl: "https://api.razorpay.com/v1/qr_codes/qr_real_12345/image",
        paymentsAmountReceived: 0,
        paymentsCountReceived: 0,
        closeBy: Math.floor(Date.now() / 1000) + 900,
      } as never);

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_real_qr",
        restaurantId: "rest_1",
        totalPaise: 25000,
        orderNumber: "ML-4001",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-4" },
        restaurant: { name: "Masala Lane" },
      } as never);

      const result = await createUpiQrPayment(
        { db },
        { orderId: "order_real_qr", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.qrAvailable).toBe(true);
        expect(result.data.qrCodeId).toBe("qr_real_12345");
        expect(result.data.qrImageUrl).toBe(
          "https://api.razorpay.com/v1/qr_codes/qr_real_12345/image"
        );
        expect(result.data.isLiveRazorpayQr).toBe(true);
      }
    });

    it("createUpiQrPayment returns qrAvailable: false and zero fake placeholder VPAs when Razorpay QR API returns null", async () => {
      vi.mocked(isRazorpayTestMode).mockReturnValue(true);
      // Razorpay QR API returns null (unavailable in test mode or disabled on account)
      vi.mocked(createRazorpayQrCode).mockResolvedValue(null);

      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_qr_unavailable",
        restaurantId: "rest_1",
        totalPaise: 25000,
        orderNumber: "ML-4002",
        status: "placed",
        paymentStatus: "pending",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-4" },
        restaurant: { name: "Masala Lane" },
      } as never);

      const result = await createUpiQrPayment(
        { db },
        { orderId: "order_qr_unavailable", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.qrAvailable).toBe(false);
        expect(result.data.qrImageUrl).toBeNull();
        expect(result.data.qrCodeId).toBeNull();
        expect(result.data.message).toBeTruthy();
        // Never contain fake placeholder VPA or manually generated QR string
        expect(result.data.qrString).toBeNull();
      }
    });

    it("returns payment status from database and verifies captured QR payment via Razorpay", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_status_check",
        restaurantId: "rest_1",
        totalPaise: 30000,
        orderNumber: "ML-4002",
        status: "placed",
        paymentStatus: "pending",
        paymentMethod: "pay_now",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-5" },
      } as never);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_rec_1",
        orderId: "order_status_check",
        restaurantId: "rest_1",
        amountPaise: 30000,
        status: "pending",
        razorpayOrderId: "qr_real_123",
      } as never);

      vi.mocked(fetchRazorpayQrCode).mockResolvedValue({
        id: "qr_real_123",
        status: "closed",
        paymentsAmountReceived: 30000,
      });

      vi.mocked(fetchRazorpayQrCodePayments).mockResolvedValue([
        {
          id: "pay_qr_cap_999",
          amount: 30000,
          currency: "INR",
          status: "captured",
          method: "upi",
        },
      ]);

      const result = await getPaymentStatus(
        { db },
        { orderId: "order_status_check", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe("paid");
      }
      expect(db.transaction).toHaveBeenCalled();
    });

    it("does not mark order paid in getPaymentStatus if Razorpay QR ID does not match persisted razorpayOrderId", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_status_check_mismatch",
        restaurantId: "rest_1",
        totalPaise: 30000,
        orderNumber: "ML-4003",
        status: "placed",
        paymentStatus: "pending",
        paymentMethod: "pay_now",
        createdAt: new Date(),
        table: { qrToken: "valid_token", tableNumber: "T-5" },
      } as never);

      vi.mocked(db.query.payments.findFirst).mockResolvedValue({
        id: "pay_rec_mismatch",
        orderId: "order_status_check_mismatch",
        restaurantId: "rest_1",
        amountPaise: 30000,
        status: "pending",
        razorpayOrderId: "qr_persisted_expected_123",
      } as never);

      // Razorpay returns a different QR resource ID
      vi.mocked(fetchRazorpayQrCode).mockResolvedValue({
        id: "qr_different_unrelated_456",
        status: "closed",
        paymentsAmountReceived: 30000,
      });

      vi.mocked(fetchRazorpayQrCodePayments).mockResolvedValue([]);

      const result = await getPaymentStatus(
        { db },
        { orderId: "order_status_check_mismatch", token: "valid_token" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Order remains pending because QR ID did not match
        expect(result.data.status).toBe("pending");
      }
      expect(db.transaction).not.toHaveBeenCalled();
    });
  });
});


