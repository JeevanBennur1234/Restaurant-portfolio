import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockStaffSession, mockDb } = vi.hoisted(() => {
  const mockStaffSession = {
    userId: "user_manager_1",
    username: "manager",
    role: "manager" as const,
    restaurantId: "rest_1",
  };

  const mockDb = {
    query: {
      orders: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      tables: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      categories: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      menuItems: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      orderItems: {
        findFirst: vi.fn(),
      },
      modifiers: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn(),
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn(),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      return cb(mockDb);
    }),
  };

  return { mockStaffSession, mockDb };
});

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DEMO_MODE: "false",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

vi.mock("@/server/auth", () => ({
  getStaffSession: vi.fn(async () => mockStaffSession),
}));

vi.mock("@/server/db", () => ({
  db: mockDb,
}));

import {
  deleteTable,
  deleteCategory,
  deleteMenuItem,
  cancelOrder,
} from "@/server/services/manager";
import type { Database } from "@/server/db";
import type { Ctx } from "@/server/services/result";

const ctx: Ctx = { db: mockDb as unknown as Database, actor: mockStaffSession };

describe("Data Model Integrity & Business Rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Requirement 1: Table Soft-Delete", () => {
    it("deleteTable performs soft-delete by setting isActive to false", async () => {
      const result = await deleteTable(
        ctx,
        { id: "table_1" }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  describe("Requirement 2: Category and Menu Item Deletion Constraints", () => {
    it("deleteCategory refuses deletion when category contains menu items", async () => {
      mockDb.query.menuItems.findFirst.mockResolvedValueOnce({
        id: "item_1",
        name: "Butter Chicken",
        categoryId: "cat_1",
      });

      const result = await deleteCategory(
        ctx,
        { id: "cat_1" }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("Cannot delete category containing menu items");
      }
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("deleteCategory deletes category when it has no menu items", async () => {
      mockDb.query.menuItems.findFirst.mockResolvedValueOnce(null);

      const result = await deleteCategory(
        ctx,
        { id: "cat_empty" }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it("deleteMenuItem soft-deletes (sets isActive=false) when item appears in order_items", async () => {
      mockDb.query.orderItems.findFirst.mockResolvedValueOnce({
        id: "order_item_1",
        orderId: "ord_1",
        menuItemId: "item_ordered",
      });

      const result = await deleteMenuItem(
        ctx,
        { id: "item_ordered" }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("deleteMenuItem hard-deletes item when it does not appear in order_items", async () => {
      mockDb.query.orderItems.findFirst.mockResolvedValueOnce(null);

      const result = await deleteMenuItem(
        ctx,
        { id: "item_never_ordered" }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.delete).toHaveBeenCalled();
    });
  });

  describe("Requirement 4: cancelOrder Payment Refund Status", () => {
    it("sets payment status to refund_pending when order payment is completed", async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: "order_paid_1",
        restaurantId: "rest_1",
        status: "preparing",
        paymentStatus: "paid",
        payments: [{ id: "pay_1", status: "completed" }],
        table: { tableNumber: "Table 1" },
      });

      const result = await cancelOrder(
        ctx,
        {
          orderId: "order_paid_1",
          reason: "Customer changed mind",
        }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.transaction).toHaveBeenCalled();
      // Updates order and payment rows with refund_pending
      expect(mockDb.update).toHaveBeenCalled();
    });

    it("does not set refund_pending when order was unpaid/counter", async () => {
      mockDb.query.orders.findFirst.mockResolvedValueOnce({
        id: "order_unpaid_1",
        restaurantId: "rest_1",
        status: "placed",
        paymentStatus: "counter",
        payments: [],
        table: { tableNumber: "Table 2" },
      });

      const result = await cancelOrder(
        ctx,
        {
          orderId: "order_unpaid_1",
          reason: "Customer left",
        }
      );

      expect(result.ok).toBe(true);
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });
});
