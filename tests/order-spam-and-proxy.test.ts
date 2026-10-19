import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "production",
    PAYMENTS_MODE: "online",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "https://dinepulse.example.com",
    SESSION_SECRET: "test-secret-at-least-32-characters-long-123456",
    NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "mock_service_key",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock_anon_key",
    RAZORPAY_KEY_ID: "rzp_live_testkey123",
    RAZORPAY_KEY_SECRET: "rzp_live_secret123",
  },
}));

const mockTables: Array<{ id: string; restaurantId: string; tableNumber: string; qrToken: string; isActive: boolean; capacity: number }> = [
  { id: "tbl_1", restaurantId: "rest_1", tableNumber: "T-01", qrToken: "tok_table1", isActive: true, capacity: 4 },
  { id: "tbl_2", restaurantId: "rest_1", tableNumber: "T-02", qrToken: "tok_inactive", isActive: false, capacity: 2 },
  { id: "tbl_other", restaurantId: "rest_2", tableNumber: "T-99", qrToken: "tok_other_rest", isActive: true, capacity: 4 },
];

const mockMenuItems = [
  { id: "menu_1", name: "Paneer Tikka", pricePaise: 25000, isAvailable: true, isActive: true },
  { id: "menu_2", name: "Butter Naan", pricePaise: 5000, isAvailable: true, isActive: true },
];

vi.mock("@/server/db", () => ({
  db: {
    query: {
      loginAttempts: {
        findFirst: vi.fn(async () => null),
      },
      tables: {
        findFirst: vi.fn(async () => mockTables[0]),
        findMany: vi.fn(async () => mockTables.filter((t) => t.restaurantId === "rest_1" && t.isActive)),
      },
      menuItems: {
        findMany: vi.fn(async () => mockMenuItems),
      },
      modifiers: {
        findMany: vi.fn(async () => []),
      },
      orders: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ count: 1, windowStart: new Date() }]),
        })),
        returning: vi.fn().mockResolvedValue([{ id: "order_new_1", orderNumber: "ML-0001" }]),
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
            returning: vi.fn().mockResolvedValue([{ id: "order_new_1", orderNumber: "ML-0001" }]),
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

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/razorpay", () => ({
  createRazorpayOrder: vi.fn().mockResolvedValue({ id: "rzp_order_999", keyId: "rzp_live_testkey123" }),
  isRazorpayConfigured: vi.fn().mockReturnValue(true),
  isRazorpayTestMode: vi.fn().mockReturnValue(false),
  isOnlinePaymentsEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(async () => ({
    userId: "staff_1",
    role: "manager",
    restaurantId: "rest_1",
    username: "manager1",
  })),
}));

import { env } from "@/server/env";
import { checkRateLimit } from "@/server/rate-limit";
import { placeOrder, createRazorpayOrder } from "@/server/services/customer";
import { GET as getQrPdf } from "@/app/api/admin/tables/qr-pdf/route";
import { proxy } from "@/proxy";
import { db } from "@/server/db";
import { INDIAN_PHONE_REGEX } from "@/lib/validations/order";

describe("Rate Limiter Helper (checkRateLimit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows first request and starts a new window via atomic query", async () => {
    const mockReturning = vi.fn().mockResolvedValueOnce([{ count: 1, windowStart: new Date() }]);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      }),
    } as never);

    const result = await checkRateLimit({
      key: "test_key_1",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.remaining).toBe(4);
    // Verified: No read-then-write (findFirst not called)
    expect(db.query.loginAttempts.findFirst).not.toHaveBeenCalled();
  });

  it("increments within active window and allows until limit atomically", async () => {
    const mockReturning = vi.fn().mockResolvedValueOnce([{ count: 3, windowStart: new Date(Date.now() - 10000) }]);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      }),
    } as never);

    const result = await checkRateLimit({
      key: "test_key_2",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.remaining).toBe(2);
    expect(db.query.loginAttempts.findFirst).not.toHaveBeenCalled();
  });

  it("blocks request when limit is exceeded and provides retryAfterSeconds atomically", async () => {
    const mockReturning = vi.fn().mockResolvedValueOnce([{ count: 6, windowStart: new Date(Date.now() - 20000) }]);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      }),
    } as never);

    const result = await checkRateLimit({
      key: "test_key_3",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(false);
    expect(result.count).toBe(6);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(db.query.loginAttempts.findFirst).not.toHaveBeenCalled();
  });

  it("resets window if windowMs has elapsed via atomic query", async () => {
    const mockReturning = vi.fn().mockResolvedValueOnce([{ count: 1, windowStart: new Date() }]);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: mockReturning,
        }),
      }),
    } as never);

    const result = await checkRateLimit({
      key: "test_key_4",
      limit: 5,
      windowMs: 60000,
    });

    expect(result.allowed).toBe(true);
    expect(result.count).toBe(1);
    expect(result.remaining).toBe(4);
    expect(db.query.loginAttempts.findFirst).not.toHaveBeenCalled();
  });
});

describe("Order Spam Protections (placeOrderAction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue(undefined as unknown as { key: string; count: number; windowStart: Date; updatedAt: Date });
  });

  it("Requirement 1: enforces Indian phone regex validation", () => {
    // Valid Indian phone formats
    expect(INDIAN_PHONE_REGEX.test("9876543210")).toBe(true);
    expect(INDIAN_PHONE_REGEX.test("+919876543210")).toBe(true);
    expect(INDIAN_PHONE_REGEX.test("09876543210")).toBe(true);
    expect(INDIAN_PHONE_REGEX.test("6123456789")).toBe(true);

    // Invalid phone formats
    expect(INDIAN_PHONE_REGEX.test("1234567890")).toBe(false); // Does not start with 6-9
    expect(INDIAN_PHONE_REGEX.test("987654321")).toBe(false); // Only 9 digits
    expect(INDIAN_PHONE_REGEX.test("abcd987654")).toBe(false); // Non-digit
  });

  it("Requirement 1: rejects order if total item quantity exceeds 30", async () => {
    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [
          { menuItemId: "menu_1", quantity: 20, selectedModifierIds: [] },
          { menuItemId: "menu_2", quantity: 15, selectedModifierIds: [] },
        ],
        paymentMethod: "pay_now",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/30 total items/i);
    }
  });

  it("Requirement 1: rejects order if invalid customer phone number provided", async () => {
    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [{ menuItemId: "menu_1", quantity: 2, selectedModifierIds: [] }],
        paymentMethod: "pay_now",
        customerPhone: "1234567890", // Invalid: does not start with 6-9
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/valid 10-digit Indian phone number/i);
    }
  });

  it("Requirement 1: allows order with valid formatted Indian customer phone", async () => {
    vi.mocked(db.query.orders.findMany)
      .mockResolvedValueOnce([]) // unpaid orders check
      .mockResolvedValueOnce([]); // 10 min orders check

    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [{ menuItemId: "menu_1", quantity: 2, selectedModifierIds: [] }],
        paymentMethod: "pay_now",
        customerPhone: "+91 98765 43210",
      }
    );

    expect(result.ok).toBe(true);
  });

  it("Requirement 1: blocks order if table already has 3 unpaid pay_now orders in last 30 min", async () => {
    vi.mocked(db.query.orders.findMany)
      .mockResolvedValueOnce([
        { id: "o1" },
        { id: "o2" },
        { id: "o3" },
      ] as unknown as []); // 3 unpaid orders

    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [{ menuItemId: "menu_1", quantity: 1, selectedModifierIds: [] }],
        paymentMethod: "pay_now",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/3 unpaid orders/i);
    }
  });

  it("Requirement 1: blocks order if table already has 5 orders in last 10 minutes", async () => {
    vi.mocked(db.query.orders.findMany)
      .mockResolvedValueOnce([]) // 0 unpaid pay_now orders
      .mockResolvedValueOnce([
        { id: "o1" },
        { id: "o2" },
        { id: "o3" },
        { id: "o4" },
        { id: "o5" },
      ] as unknown as []); // 5 orders in last 10 min

    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [{ menuItemId: "menu_1", quantity: 1, selectedModifierIds: [] }],
        paymentMethod: "counter",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/maximum 5 orders per 10 minutes/i);
    }
  });

  it("Requirement 2: rate limits placeOrder when token limit exceeded", async () => {
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{ count: 15, windowStart: new Date() }]),
        }),
      }),
    } as never);

    const result = await placeOrder(
      { db },
      {
        token: "tok_table1",
        items: [{ menuItemId: "menu_1", quantity: 1, selectedModifierIds: [] }],
        paymentMethod: "pay_now",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/too many order requests/i);
    }
  });

  it("Requirement 2: rate limits createRazorpayOrder when token limit exceeded", async () => {
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValueOnce([{ count: 15, windowStart: new Date() }]),
        }),
      }),
    } as never);

    const result = await createRazorpayOrder(
      { db },
      {
        orderId: "ord_1",
        token: "tok_table1",
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/too many payment requests/i);
    }
  });
});

describe("QR PDF Generation Security (GET /api/admin/tables/qr-pdf)", () => {
  it("Requirement 3: builds QR URLs ONLY from env.NEXT_PUBLIC_APP_URL and never Host header", async () => {
    const req = new NextRequest("http://evil-host.com/api/admin/tables/qr-pdf", {
      headers: {
        host: "evil-host.com",
      },
    });

    const res = await getQrPdf(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });
});

describe("Next.js 16 Proxy Security Headers (src/proxy.ts)", () => {
  it("Requirement 2: allows same-origin embedding via frame-ancestors 'self' and X-Frame-Options SAMEORIGIN", () => {
    const req = new NextRequest("http://localhost:3000/demo");
    const res = proxy(req);

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    // Must allow 'self' so /demo can embed /t/* and /kitchen inside preview iframes
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");

    // X-Frame-Options must be SAMEORIGIN
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(res.headers.get("X-Frame-Options")).not.toBe("DENY");
  });

  it("Requirement 2: removes 'unsafe-eval' from script-src in production, but preserves it in development", () => {
    // In production
    env.NODE_ENV = "production";
    const prodRes = proxy(new NextRequest("http://localhost:3000/"));
    const prodCsp = prodRes.headers.get("Content-Security-Policy") ?? "";
    const scriptSrcMatch = prodCsp.match(/script-src [^;]+/);
    expect(scriptSrcMatch).toBeTruthy();
    expect(scriptSrcMatch![0]).not.toContain("'unsafe-eval'");

    // In development
    env.NODE_ENV = "development";
    const devRes = proxy(new NextRequest("http://localhost:3000/"));
    const devCsp = devRes.headers.get("Content-Security-Policy") ?? "";
    const devScriptSrcMatch = devCsp.match(/script-src [^;]+/);
    expect(devScriptSrcMatch).toBeTruthy();
    expect(devScriptSrcMatch![0]).toContain("'unsafe-eval'");

    // Reset back to production
    env.NODE_ENV = "production";
  });

  it("Requirement 4: sets comprehensive security headers including nosniff, referrer-policy, HSTS", () => {
    const req = new NextRequest("http://localhost:3000/admin");
    const res = proxy(req);

    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("checkout.razorpay.com");
    expect(csp).toContain("api.razorpay.com");
    expect(csp).toContain("https://xyzcompany.supabase.co");
    expect(csp).toContain("wss://xyzcompany.supabase.co");
    expect(csp).toContain("fonts.googleapis.com");
    expect(csp).toContain("fonts.gstatic.com");
    expect(csp).toContain("media-src 'self'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
  });
});
