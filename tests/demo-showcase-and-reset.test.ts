import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DEMO_MODE: "true",
    DEMO_RESET_SECRET: "test_demo_reset_secret_key_12345",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "https://dinepulse.example.com",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
  },
}));

const mockStaffUsers = [
  {
    id: "usr_kitchen",
    role: "kitchen",
    username: "kitchen",
    restaurantId: "rest_1",
    isActive: true,
    isDemo: true,
    sessionVersion: 1,
  },
  {
    id: "usr_manager",
    role: "manager",
    username: "manager",
    restaurantId: "rest_1",
    isActive: true,
    isDemo: true,
    sessionVersion: 1,
  },
];

const mockCurrentSession = {
  value: {
    userId: "usr_manager",
    username: "manager",
    role: "manager" as const,
    restaurantId: "rest_1",
    restaurantName: "Masala Lane",
    isDemo: true,
  },
};

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(async () => mockCurrentSession.value),
  setStaffSessionCookie: vi.fn(async () => undefined),
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/db", () => ({
  db: {
    query: {
      staffUsers: {
        findFirst: vi.fn(async () => mockStaffUsers[0]),
      },
      restaurants: {
        findFirst: vi.fn(async () => ({ id: "rest_1", slug: "masala-lane", name: "Masala Lane" })),
      },
      orders: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => []),
      },
      tables: {
        findFirst: vi.fn(async () => ({ id: "tbl_1", restaurantId: "rest_1" })),
        findMany: vi.fn(async () => [{ id: "tbl_1", tableNumber: "Table 1" }]),
      },
      menuItems: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [{ id: "item_1", name: "Butter Chicken", pricePaise: 45000 }]),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "o_new_1" }]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ id: "o_new_1" }]),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        query: {
          orders: { findFirst: vi.fn().mockResolvedValue(null) },
        },
      };
      return cb(txMock);
    }),
  },
}));

import { env } from "@/server/env";
import { db } from "@/server/db";
import { demoLoginAction } from "@/server/actions/demo";
import {
  deleteTableAction,
  deleteCategoryAction,
  deleteMenuItemAction,
  cancelOrderAction,
} from "@/server/actions/admin";
import { POST as handleUpload } from "@/app/api/admin/upload/route";
import { POST as handleDemoReset } from "@/app/api/demo/reset/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("Demo Login Action (demoLoginAction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { DEMO_MODE: string }).DEMO_MODE = "true";
  });

  it("fails if DEMO_MODE is false", async () => {
    (env as { DEMO_MODE: string }).DEMO_MODE = "false";
    const result = await demoLoginAction("kitchen");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/DEMO_MODE/i);
  });

  it("fails on invalid role", async () => {
    const result = await demoLoginAction("superadmin");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid demo role/i);
  });

  it("successfully logs in demo kitchen user and redirects to /kitchen", async () => {
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockStaffUsers[0] as never);

    const result = await demoLoginAction("kitchen");
    expect(result.success).toBe(true);
    expect(result.redirectTo).toBe("/kitchen");
  });

  it("successfully logs in demo manager user and redirects to /admin", async () => {
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockStaffUsers[1] as never);

    const result = await demoLoginAction("manager");
    expect(result.success).toBe(true);
    expect(result.redirectTo).toBe("/admin");
  });
});

describe("Demo Manager Restrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentSession.value = {
      userId: "usr_manager",
      username: "manager",
      role: "manager",
      restaurantId: "rest_1",
      restaurantName: "Masala Lane",
      isDemo: true,
    };
  });

  it("blocks demo manager from deleting tables", async () => {
    const res = await deleteTableAction({ id: "tbl_1" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cannot delete tables/i);
  });

  it("blocks demo manager from deleting categories", async () => {
    const res = await deleteCategoryAction({ id: "cat_1" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cannot delete categories/i);
  });

  it("blocks demo manager from deleting menu items", async () => {
    const res = await deleteMenuItemAction({ id: "item_1" });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cannot delete menu items/i);
  });

  it("blocks demo manager from uploading images", async () => {
    const req = new NextRequest("http://localhost:3000/api/admin/upload", {
      method: "POST",
    });

    const res = await handleUpload(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/cannot upload images/i);
  });

  it("blocks demo manager from cancelling a paid order", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
      id: "ord_paid_1",
      restaurantId: "rest_1",
      status: "accepted",
      paymentStatus: "paid",
      payments: [{ status: "completed" }],
    } as never);

    const res = await cancelOrderAction({
      orderId: "ord_paid_1",
      reason: "Customer changed mind",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/cannot cancel paid orders/i);
  });
});

describe("POST /api/demo/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { DEMO_MODE: string }).DEMO_MODE = "true";
  });

  it("rejects when DEMO_MODE is false", async () => {
    (env as { DEMO_MODE: string }).DEMO_MODE = "false";
    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
      headers: {
        authorization: `Bearer test_demo_reset_secret_key_12345`,
      },
    });

    const res = await handleDemoReset(req);
    expect(res.status).toBe(403);
  });

  it("rejects request missing Authorization header", async () => {
    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
    });

    const res = await handleDemoReset(req);
    expect(res.status).toBe(401);
  });

  it("rejects request with invalid secret", async () => {
    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
      headers: {
        authorization: "Bearer wrong_secret_here",
      },
    });

    const res = await handleDemoReset(req);
    expect(res.status).toBe(401);
  });

  it("resets orders and seeds sample state when properly authorized", async () => {
    const req = new NextRequest("http://localhost:3000/api/demo/reset", {
      method: "POST",
      headers: {
        authorization: `Bearer test_demo_reset_secret_key_12345`,
      },
    });

    const res = await handleDemoReset(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});

describe("SEO Metadata: robots and sitemap", () => {
  it("robots.ts allows / and /demo, disallows /admin, /kitchen, and /t/", () => {
    const res = robots();
    const rules = Array.isArray(res.rules) ? res.rules[0] : res.rules;

    expect(rules.disallow).toEqual(["/admin", "/kitchen", "/t/"]);
    expect(rules.allow).toEqual(["/", "/demo"]);
    expect(res.sitemap).toContain("/sitemap.xml");
  });

  it("sitemap.ts indexes / and /demo with priority", () => {
    const res = sitemap();
    const urls = res.map((item) => item.url);

    expect(urls).toContain("https://dinepulse.example.com");
    expect(urls).toContain("https://dinepulse.example.com/demo");
  });
});
