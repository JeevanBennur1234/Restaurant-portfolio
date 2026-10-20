import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment and realtime
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://mock",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

// Mock database
vi.mock("@/server/db", () => {
  return {
    db: {
      query: {
        orders: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
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

import { db } from "@/server/db";
import { transitionOrderStatus, listKitchenTickets } from "@/server/services/kitchen";
import type { StaffSession } from "@/server/auth";

const mockKitchenActor: StaffSession = {
  userId: "user_kitchen_1",
  username: "chef_ramsay",
  role: "kitchen",
  restaurantId: "rest_masala_1",
  restaurantName: "Masala Lane",
  isDemo: false,
};

describe("Kitchen Payment Security & Concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("transitionOrderStatus payment enforcement", () => {
    it("blocks pending pay_now orders from advancing in kitchen states", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_pending_1",
        restaurantId: "rest_masala_1",
        orderNumber: "ML-101",
        status: "placed",
        paymentStatus: "pending",
        paymentMethod: "pay_now",
        table: { tableNumber: "T-1" },
        restaurant: { id: "rest_masala_1" },
      } as never);

      const result = await transitionOrderStatus(
        { db, actor: mockKitchenActor },
        { orderId: "order_pending_1", toStatus: "accepted" }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CONFLICT");
        expect(result.status).toBe(409);
        expect(result.message).toContain("must be paid");
      }
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("blocks failed pay_now orders from advancing in kitchen states", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_failed_1",
        restaurantId: "rest_masala_1",
        orderNumber: "ML-102",
        status: "placed",
        paymentStatus: "failed",
        paymentMethod: "pay_now",
        table: { tableNumber: "T-2" },
        restaurant: { id: "rest_masala_1" },
      } as never);

      const result = await transitionOrderStatus(
        { db, actor: mockKitchenActor },
        { orderId: "order_failed_1", toStatus: "preparing" }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CONFLICT");
        expect(result.status).toBe(409);
        expect(result.message).toContain("failed");
      }
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it("allows valid paid pay_now orders to transition through kitchen states", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_paid_1",
        restaurantId: "rest_masala_1",
        orderNumber: "ML-103",
        status: "placed",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        table: { tableNumber: "T-3" },
        restaurant: { id: "rest_masala_1" },
      } as never);

      const result = await transitionOrderStatus(
        { db, actor: mockKitchenActor },
        { orderId: "order_paid_1", toStatus: "accepted" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.newStatus).toBe("accepted");
      }
      expect(db.transaction).toHaveBeenCalled();
    });

    it("allows valid pay-at-counter orders to transition through kitchen states", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_counter_1",
        restaurantId: "rest_masala_1",
        orderNumber: "ML-104",
        status: "placed",
        paymentStatus: "counter",
        paymentMethod: "counter",
        table: { tableNumber: "T-4" },
        restaurant: { id: "rest_masala_1" },
      } as never);

      const result = await transitionOrderStatus(
        { db, actor: mockKitchenActor },
        { orderId: "order_counter_1", toStatus: "preparing" }
      );

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.newStatus).toBe("preparing");
      }
      expect(db.transaction).toHaveBeenCalled();
    });

    it("detects concurrent update conflict when rowCount is 0", async () => {
      vi.mocked(db.query.orders.findFirst).mockResolvedValue({
        id: "order_race_1",
        restaurantId: "rest_masala_1",
        orderNumber: "ML-105",
        status: "placed",
        paymentStatus: "paid",
        paymentMethod: "pay_now",
        table: { tableNumber: "T-5" },
        restaurant: { id: "rest_masala_1" },
      } as never);

      // Simulate concurrent update where rowCount is 0 because status was updated by another request
      vi.mocked(db.transaction).mockImplementation((async (
        cb: (tx: unknown) => Promise<unknown>
      ) => {
        const mockTx = {
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue({ rowCount: 0 }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
          }),
        };
        return cb(mockTx);
      }) as never);

      const result = await transitionOrderStatus(
        { db, actor: mockKitchenActor },
        { orderId: "order_race_1", toStatus: "accepted" }
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CONFLICT");
        expect(result.status).toBe(409);
        expect(result.message).toContain("concurrently");
      }
    });
  });

  describe("listKitchenTickets visibility", () => {
    it("filters out pending and failed pay_now orders from kitchen ticket board", async () => {
      vi.mocked(db.query.orders.findMany).mockResolvedValue([
        {
          id: "ord_visible_paid",
          orderNumber: "ML-201",
          status: "placed",
          paymentStatus: "paid",
          paymentMethod: "pay_now",
          createdAt: new Date(),
          specialInstructions: null,
          table: { tableNumber: "T-1" },
          items: [],
        },
        {
          id: "ord_visible_counter",
          orderNumber: "ML-202",
          status: "placed",
          paymentStatus: "counter",
          paymentMethod: "counter",
          createdAt: new Date(),
          specialInstructions: null,
          table: { tableNumber: "T-2" },
          items: [],
        },
        {
          id: "ord_hidden_pending",
          orderNumber: "ML-203",
          status: "placed",
          paymentStatus: "pending",
          paymentMethod: "pay_now",
          createdAt: new Date(),
          specialInstructions: null,
          table: { tableNumber: "T-3" },
          items: [],
        },
        {
          id: "ord_hidden_failed",
          orderNumber: "ML-204",
          status: "placed",
          paymentStatus: "failed",
          paymentMethod: "pay_now",
          createdAt: new Date(),
          specialInstructions: null,
          table: { tableNumber: "T-4" },
          items: [],
        },
      ] as never);

      const result = await listKitchenTickets({ db, actor: mockKitchenActor });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.length).toBe(2);
        const ids = result.data.map((t) => t.id);
        expect(ids).toContain("ord_visible_paid");
        expect(ids).toContain("ord_visible_counter");
        expect(ids).not.toContain("ord_hidden_pending");
        expect(ids).not.toContain("ord_hidden_failed");
      }
    });
  });
});
