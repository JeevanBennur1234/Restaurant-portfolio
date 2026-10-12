import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock environment
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DEMO_MODE: "true",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
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
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
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
import { publishRealtimeEvent } from "@/server/realtime";
import { simulateKitchenStepAction } from "@/server/actions/demo";
import * as orderActions from "@/server/actions/order";

describe("Demo Simulation Action (simulateKitchenStepAction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.DEMO_MODE = "true";
  });

  it("verifies advanceOrderStatusAction has been removed from order.ts", () => {
    expect("advanceOrderStatusAction" in orderActions).toBe(false);
  });

  it("rejects simulation when DEMO_MODE is not 'true'", async () => {
    env.DEMO_MODE = "false";

    const result = await simulateKitchenStepAction("order_1", "tok_valid");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Demo simulation is disabled");
    expect(db.query.orders.findFirst).not.toHaveBeenCalled();
  });

  it("rejects simulation when table token does not own the order", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue({
      id: "order_1",
      status: "placed",
      restaurantId: "rest_1",
      orderNumber: "ML-1001",
      table: {
        tableNumber: "Table 7",
        qrToken: "tok_table_7",
      },
    } as never);

    const result = await simulateKitchenStepAction("order_1", "wrong_token");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Unauthorized access to order");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("moves placed order strictly to preparing (next valid step)", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue({
      id: "order_1",
      status: "placed",
      restaurantId: "rest_1",
      orderNumber: "ML-1001",
      table: {
        tableNumber: "Table 7",
        qrToken: "tok_table_7",
      },
    } as never);

    const result = await simulateKitchenStepAction("order_1", "tok_table_7");
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("preparing");
    expect(db.transaction).toHaveBeenCalled();
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      "restaurant:rest_1",
      "order.status_changed",
      expect.objectContaining({ toStatus: "preparing" })
    );
    expect(publishRealtimeEvent).toHaveBeenCalledWith(
      "order:order_1",
      "order.status_changed",
      { orderId: "order_1", status: "preparing" }
    );
  });

  it("moves preparing order strictly to ready", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue({
      id: "order_1",
      status: "preparing",
      restaurantId: "rest_1",
      orderNumber: "ML-1001",
      table: {
        tableNumber: "Table 7",
        qrToken: "tok_table_7",
      },
    } as never);

    const result = await simulateKitchenStepAction("order_1", "tok_table_7");
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("ready");
  });

  it("moves ready order strictly to served", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue({
      id: "order_1",
      status: "ready",
      restaurantId: "rest_1",
      orderNumber: "ML-1001",
      table: {
        tableNumber: "Table 7",
        qrToken: "tok_table_7",
      },
    } as never);

    const result = await simulateKitchenStepAction("order_1", "tok_table_7");
    expect(result.success).toBe(true);
    expect(result.newStatus).toBe("served");
  });

  it("rejects advancing when order is already served or cancelled", async () => {
    vi.mocked(db.query.orders.findFirst).mockResolvedValue({
      id: "order_1",
      status: "served",
      restaurantId: "rest_1",
      orderNumber: "ML-1001",
      table: {
        tableNumber: "Table 7",
        qrToken: "tok_table_7",
      },
    } as never);

    const result = await simulateKitchenStepAction("order_1", "tok_table_7");
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot be advanced further");
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
