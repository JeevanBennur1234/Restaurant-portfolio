import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateEnv } from "@/server/env";
import { isOnlinePaymentsEnabled } from "@/server/razorpay";

// Mock rate-limit & realtime before imports
vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

// In-memory mock DB state
const mockTable = {
  id: "tbl_1",
  tableNumber: "T-1",
  restaurantId: "rest_1",
  isActive: true,
  qrToken: "valid_token",
  restaurant: {
    id: "rest_1",
    name: "Masala Lane",
    slug: "masala-lane",
    currency: "INR",
    isActive: true,
  },
};

const mockItem = {
  id: "item_1",
  restaurantId: "rest_1",
  name: "Tandoori Roti",
  pricePaise: 4000,
  isAvailable: true,
};

vi.mock("@/server/db", () => ({
  db: {
    query: {
      tables: {
        findFirst: vi.fn(async () => mockTable),
        findMany: vi.fn(async () => [mockTable]),
      },
      restaurants: {
        findFirst: vi.fn(async () => mockTable.restaurant),
      },
      categories: {
        findMany: vi.fn(async () => []),
      },
      menuItems: {
        findMany: vi.fn(async () => [mockItem]),
        findFirst: vi.fn(async () => mockItem),
      },
      modifiers: {
        findMany: vi.fn(async () => []),
      },
      orders: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
      payments: {
        findFirst: vi.fn(async () => null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ count: 1, windowStart: new Date() }]),
        })),
        returning: vi.fn().mockResolvedValue([{ id: "ord_new_1", orderNumber: "ML-0001" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([{ lastOrderNumber: 1 }]),
      })),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "ord_new_1", orderNumber: "ML-0001" }]),
            onConflictDoUpdate: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ lastOrderNumber: 1 }]),
            }),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ lastOrderNumber: 1 }]),
            })),
          })),
        })),
        query: {
          orders: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      };
      return cb(txMock);
    }),
  },
}));

import {
  placeOrder,
  getMenuForTable,
  createRazorpayOrder,
  verifyRazorpayPayment,
  createUpiQrPayment,
} from "@/server/services/customer";
import { POST as razorpayWebhookPost } from "@/app/api/webhooks/razorpay/route";
import { NextRequest } from "next/server";
import { db } from "@/server/db";

// Base valid production environment variables without any Razorpay keys
const baseProdEnv: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://postgres:pass@localhost:5432/dinepulse",
  NEXT_PUBLIC_APP_URL: "https://example.com",
  SESSION_SECRET: "at-least-32-characters-production-session-secret-string",
  NEXT_PUBLIC_SUPABASE_URL: "https://prod-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "prod-anon-key-string",
  SUPABASE_SERVICE_ROLE_KEY: "prod-service-role-key-string",
};

describe("Site-Aware Production Environment Validation", () => {
  it("production + SITE=kitchen passes without any Razorpay variables", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "kitchen",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SITE).toBe("kitchen");
      expect(result.data.RAZORPAY_KEY_ID).toBeUndefined();
    }
  });

  it("production + SITE=manager passes without any Razorpay variables", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "manager",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SITE).toBe("manager");
      expect(result.data.RAZORPAY_KEY_ID).toBeUndefined();
    }
  });

  it("production + SITE=customer + PAYMENTS_MODE=online without keys FAILS with Razorpay error messages", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "online",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("RAZORPAY_KEY_ID is required"))).toBe(true);
      expect(messages.some((m) => m.includes("RAZORPAY_KEY_SECRET is required"))).toBe(true);
      expect(messages.some((m) => m.includes("RAZORPAY_WEBHOOK_SECRET is required"))).toBe(true);
    }
  });

  it("production + SITE=customer defaults to PAYMENTS_MODE=online and FAILS without keys", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("RAZORPAY_KEY_ID is required"))).toBe(true);
    }
  });

  it("production + SITE=customer + PAYMENTS_MODE=counter_only passes without any Razorpay variables", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "counter_only",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SITE).toBe("customer");
      expect(result.data.PAYMENTS_MODE).toBe("counter_only");
      expect(result.data.RAZORPAY_KEY_ID).toBeUndefined();
    }
  });

  it("production + SITE=all + PAYMENTS_MODE=online without keys FAILS with Razorpay error messages", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "all",
      PAYMENTS_MODE: "online",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes("RAZORPAY_KEY_ID is required"))).toBe(true);
    }
  });

  it("production + SITE=customer + PAYMENTS_MODE=online rejects placeholder Razorpay secrets", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "online",
      RAZORPAY_KEY_ID: "rzp_live_real_key_123",
      RAZORPAY_KEY_SECRET: "placeholder_secret",
      RAZORPAY_WEBHOOK_SECRET: "real_webhook_secret_123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages.some((m) => m.includes('RAZORPAY_KEY_SECRET must not contain "placeholder"'))).toBe(true);
    }
  });

  it("production + SITE=customer + PAYMENTS_MODE=online succeeds with valid non-placeholder keys", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "online",
      RAZORPAY_KEY_ID: "rzp_live_real_key_123",
      RAZORPAY_KEY_SECRET: "real_secret_123",
      RAZORPAY_WEBHOOK_SECRET: "real_webhook_secret_123",
    });
    expect(result.success).toBe(true);
  });

  it("production rejects Supabase variables containing 'placeholder'", () => {
    const badAnon = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "counter_only",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-anon-key-placeholder",
    });
    expect(badAnon.success).toBe(false);
    if (!badAnon.success) {
      expect(
        badAnon.error.issues.some((i) =>
          i.message.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY must not contain "placeholder"')
        )
      ).toBe(true);
    }

    const badService = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "counter_only",
      SUPABASE_SERVICE_ROLE_KEY: "ci-service-role-key-placeholder",
    });
    expect(badService.success).toBe(false);
    if (!badService.success) {
      expect(
        badService.error.issues.some((i) =>
          i.message.includes('SUPABASE_SERVICE_ROLE_KEY must not contain "placeholder"')
        )
      ).toBe(true);
    }

    const badUrl = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "counter_only",
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder-project.supabase.co",
    });
    expect(badUrl.success).toBe(false);
    if (!badUrl.success) {
      expect(
        badUrl.error.issues.some((i) =>
          i.message.includes('NEXT_PUBLIC_SUPABASE_URL must not contain "placeholder"')
        )
      ).toBe(true);
    }
  });

  it("production accepts non-placeholder CI build tokens for Supabase", () => {
    const result = validateEnv({
      ...baseProdEnv,
      SITE: "customer",
      PAYMENTS_MODE: "counter_only",
      NEXT_PUBLIC_SUPABASE_URL: "https://mock-ci-project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-build-supabase-anon-key-token",
      SUPABASE_SERVICE_ROLE_KEY: "ci-build-supabase-service-role-token",
    });
    expect(result.success).toBe(true);
  });
});

describe("Server-Side Payment Mode Enforcement & Service Behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isOnlinePaymentsEnabled reports availability correctly based on PAYMENTS_MODE and keys", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    const originalKeyId = env.RAZORPAY_KEY_ID;
    const originalSecret = env.RAZORPAY_KEY_SECRET;

    try {
      // 1. Counter only -> always false regardless of keys
      env.PAYMENTS_MODE = "counter_only";
      env.RAZORPAY_KEY_ID = "rzp_test_12345";
      env.RAZORPAY_KEY_SECRET = "secret_12345";
      expect(isOnlinePaymentsEnabled()).toBe(false);

      // 2. Online mode but unconfigured keys -> false
      env.PAYMENTS_MODE = "online";
      env.RAZORPAY_KEY_ID = "";
      env.RAZORPAY_KEY_SECRET = "";
      expect(isOnlinePaymentsEnabled()).toBe(false);

      // 3. Online mode with configured keys -> true
      env.PAYMENTS_MODE = "online";
      env.RAZORPAY_KEY_ID = "rzp_test_validkey";
      env.RAZORPAY_KEY_SECRET = "valid_secret";
      expect(isOnlinePaymentsEnabled()).toBe(true);
    } finally {
      env.PAYMENTS_MODE = originalMode;
      env.RAZORPAY_KEY_ID = originalKeyId;
      env.RAZORPAY_KEY_SECRET = originalSecret;
    }
  });

  it("placeOrder rejects paymentMethod pay_now with 503 when online payments disabled", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    env.PAYMENTS_MODE = "counter_only";

    try {
      const res = await placeOrder(
        { db },
        {
          token: "valid_token",
          customerName: "Guest",
          items: [{ menuItemId: "item_1", quantity: 1, selectedModifierIds: [] }],
          paymentMethod: "pay_now",
        }
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("PAYMENT");
        expect(res.status).toBe(503);
        expect(res.message).toBe("Online payments are not available right now. Please pay at the counter.");
      }
    } finally {
      env.PAYMENTS_MODE = originalMode;
    }
  });

  it("placeOrder accepts paymentMethod counter even when PAYMENTS_MODE is counter_only", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    env.PAYMENTS_MODE = "counter_only";

    try {
      const res = await placeOrder(
        { db },
        {
          token: "valid_token",
          customerName: "Guest",
          items: [{ menuItemId: "item_1", quantity: 2, selectedModifierIds: [] }],
          paymentMethod: "counter",
        }
      );

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.paymentStatus).toBe("counter");
        expect(res.data.paymentMethod).toBe("counter");
        expect(res.data.orderId).toBeDefined();
        expect(res.data.orderNumber).toBeDefined();
      }
    } finally {
      env.PAYMENTS_MODE = originalMode;
    }
  });

  it("getMenuForTable reports paymentsEnabled and paymentsTestMode accurately", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    const originalKeyId = env.RAZORPAY_KEY_ID;
    const originalSecret = env.RAZORPAY_KEY_SECRET;

    try {
      // Case 1: counter_only -> paymentsEnabled = false
      env.PAYMENTS_MODE = "counter_only";
      env.RAZORPAY_KEY_ID = "rzp_test_placeholder";
      env.RAZORPAY_KEY_SECRET = "placeholder_secret";
      const res1 = await getMenuForTable({ db }, "valid_token");
      expect(res1.ok).toBe(true);
      if (res1.ok) {
        expect(res1.data.paymentsEnabled).toBe(false);
      }

      // Case 2: online mode with test key -> paymentsEnabled = true, paymentsTestMode = true
      env.PAYMENTS_MODE = "online";
      env.RAZORPAY_KEY_ID = "rzp_test_123456789";
      env.RAZORPAY_KEY_SECRET = "real_secret_key";
      const res2 = await getMenuForTable({ db }, "valid_token");
      expect(res2.ok).toBe(true);
      if (res2.ok) {
        expect(res2.data.paymentsEnabled).toBe(true);
        expect(res2.data.paymentsTestMode).toBe(true);
      }

      // Case 3: online mode with live key -> paymentsEnabled = true, paymentsTestMode = false
      env.PAYMENTS_MODE = "online";
      env.RAZORPAY_KEY_ID = "rzp_live_987654321";
      env.RAZORPAY_KEY_SECRET = "real_live_secret";
      const res3 = await getMenuForTable({ db }, "valid_token");
      expect(res3.ok).toBe(true);
      if (res3.ok) {
        expect(res3.data.paymentsEnabled).toBe(true);
        expect(res3.data.paymentsTestMode).toBe(false);
      }
    } finally {
      env.PAYMENTS_MODE = originalMode;
      env.RAZORPAY_KEY_ID = originalKeyId;
      env.RAZORPAY_KEY_SECRET = originalSecret;
    }
  });

  it("createRazorpayOrder, verifyRazorpayPayment, createUpiQrPayment return 503 when disabled", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    env.PAYMENTS_MODE = "counter_only";

    try {
      const resOrder = await createRazorpayOrder(
        { db },
        { orderId: "ord_1", token: "tok_1" }
      );
      expect(resOrder.ok).toBe(false);
      if (!resOrder.ok) {
        expect(resOrder.status).toBe(503);
        expect(resOrder.message).toBe("Online payments are not available right now. Please pay at the counter.");
      }

      const resVerify = await verifyRazorpayPayment(
        { db },
        {
          orderId: "ord_1",
          token: "tok_1",
          razorpayOrderId: "rzp_ord_1",
          razorpayPaymentId: "rzp_pay_1",
          razorpaySignature: "sig_1",
        }
      );
      expect(resVerify.ok).toBe(false);
      if (!resVerify.ok) {
        expect(resVerify.status).toBe(503);
        expect(resVerify.message).toBe("Online payments are not available right now. Please pay at the counter.");
      }

      const resQr = await createUpiQrPayment(
        { db },
        { orderId: "ord_1", token: "tok_1" }
      );
      expect(resQr.ok).toBe(false);
      if (!resQr.ok) {
        expect(resQr.status).toBe(503);
        expect(resQr.message).toBe("Online payments are not available right now. Please pay at the counter.");
      }
    } finally {
      env.PAYMENTS_MODE = originalMode;
    }
  });

  it("Razorpay webhook route returns 404 when PAYMENTS_MODE is counter_only", async () => {
    const { env } = await import("@/server/env");
    const originalMode = env.PAYMENTS_MODE;
    env.PAYMENTS_MODE = "counter_only";

    try {
      const req = new NextRequest("http://localhost:3000/api/webhooks/razorpay", {
        method: "POST",
        body: JSON.stringify({ event: "payment.captured" }),
        headers: { "content-type": "application/json" },
      });

      const response = await razorpayWebhookPost(req);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe("Not Found");
    } finally {
      env.PAYMENTS_MODE = originalMode;
    }
  });
});
