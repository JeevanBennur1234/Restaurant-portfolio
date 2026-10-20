import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://mock",
    APP_URL: "https://dinepulse.example.com",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
    PAYMENTS_MODE: "online",
  },
}));

const mockStaffUsers = [
  {
    id: "usr_kitchen",
    role: "kitchen",
    username: "kitchen",
    restaurantId: "rest_1",
    isActive: true,
    isDemo: false,
    sessionVersion: 1,
  },
  {
    id: "usr_manager",
    role: "manager",
    username: "manager",
    restaurantId: "rest_1",
    isActive: true,
    isDemo: false,
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
    isDemo: false,
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
        findFirst: vi.fn(async () => mockStaffUsers[1]),
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
      categories: {
        findFirst: vi.fn(async () => null),
      },
      menuItems: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [{ id: "item_1", name: "Butter Chicken", pricePaise: 45000 }]),
      },
      payments: {
        findFirst: vi.fn(async () => null),
      },
      orderItems: {
        findFirst: vi.fn(async () => null),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "o_new_1" }]),
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
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
        delete: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
        query: {
          orders: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
          },
        },
      };
      return cb(txMock);
    }),
  },
}));

import { db } from "@/server/db";
import {
  deleteTable,
  deleteCategory,
  deleteMenuItem,
  cancelOrder,
} from "@/server/services/manager";

describe("Manager Operations & Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("manager can cancel unpaid order", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce({
      id: "ord_101",
      restaurantId: "rest_1",
      status: "placed",
      paymentStatus: "pending",
      payments: [],
      table: { tableNumber: "T-1" },
    } as never);

    const res = await cancelOrder(
      { db, actor: mockCurrentSession.value },
      { orderId: "ord_101", reason: "Customer changed mind" }
    );
    expect(res.ok).toBe(true);
  });

  it("manager can delete empty category", async () => {
    vi.mocked(db.query.menuItems.findFirst).mockResolvedValueOnce(null as never);

    const res = await deleteCategory(
      { db, actor: mockCurrentSession.value },
      { id: "cat_empty_1" }
    );
    expect(res.ok).toBe(true);
  });

  it("manager can delete inactive table", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValueOnce(null as never);

    const res = await deleteTable(
      { db, actor: mockCurrentSession.value },
      { id: "tbl_1" }
    );
    expect(res.ok).toBe(true);
  });

  it("manager can delete menu item with no active orders", async () => {
    vi.mocked(db.query.orderItems.findFirst).mockResolvedValueOnce(null as never);

    const res = await deleteMenuItem(
      { db, actor: mockCurrentSession.value },
      { id: "item_1" }
    );
    expect(res.ok).toBe(true);
  });
});

describe("Client Login Security (Authentic Credentials Only)", () => {
  it("kitchen-login.tsx and admin-login.tsx contain zero hardcoded credentials and no demo shortcuts", () => {
    const kitchenLoginCode = fs.readFileSync("src/components/kitchen/kitchen-login.tsx", "utf-8");
    const adminLoginCode = fs.readFileSync("src/components/admin/admin-login.tsx", "utf-8");

    // Must not contain hardcoded credentials
    expect(kitchenLoginCode).not.toContain("kitchen123");
    expect(kitchenLoginCode).not.toContain("manager123");
    expect(kitchenLoginCode).not.toContain("handleQuickLogin");

    expect(adminLoginCode).not.toContain("kitchen123");
    expect(adminLoginCode).not.toContain("manager123");
    expect(adminLoginCode).not.toContain("handleQuickLogin");

    // Must not contain demo login shortcuts
    expect(kitchenLoginCode).not.toContain("demoLoginAction");
    expect(adminLoginCode).not.toContain("demoLoginAction");
    expect(kitchenLoginCode).not.toContain("kitchen-demo-login-btn");
    expect(adminLoginCode).not.toContain("admin-demo-login-btn");
  });
});

describe("SEO Metadata: robots and sitemap", () => {
  it("robots.ts allows / and disallows /admin, /kitchen, and /t/", () => {
    const res = robots();
    const rules = Array.isArray(res.rules) ? res.rules[0] : res.rules;

    expect(rules.disallow).toEqual(["/admin", "/kitchen", "/t/"]);
    expect(rules.allow).toEqual(["/"]);
    expect(res.sitemap).toContain("/sitemap.xml");
  });

  it("sitemap.ts indexes / without demo route", () => {
    const res = sitemap();
    const urls = res.map((item) => item.url);

    expect(urls).toContain("https://dinepulse.example.com");
    expect(urls).not.toContain("https://dinepulse.example.com/demo");
  });
});
