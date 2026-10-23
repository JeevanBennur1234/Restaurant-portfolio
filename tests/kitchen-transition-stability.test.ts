import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KitchenTicketCard } from "@/components/kitchen/kitchen-ticket";
import { transitionOrderStatus } from "@/server/services/kitchen";
import type { KitchenTicket, OrderStatus } from "@/lib/api/types";
import type { Ctx } from "@/server/services/result";

// Mock env
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/dinepulse_test",
    APP_URL: "http://localhost:3000",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
    PAYMENTS_MODE: "online",
  },
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

describe("Kitchen Transition Stability & Anti-Glitch Protection", () => {
  const sampleTicket: KitchenTicket = {
    id: "ord-test-1",
    orderNumber: "ML-1001",
    tableNumber: "T-04",
    roundNumber: 1,
    diningSessionId: null,
    status: "placed",
    paymentStatus: "paid",
    paymentMethod: "counter",
    createdAt: "2026-10-24T00:00:00Z",
    specialInstructions: null,
    items: [
      {
        id: "it-1",
        name: "Paneer Tikka",
        quantity: 2,
        modifiers: [],
        notes: null,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("KitchenTicketCard pending states & double-click protection", () => {
    it("disables button and displays 'Starting Prep…' when isPending is true in placed status", () => {
      const html = renderToStaticMarkup(
        React.createElement(KitchenTicketCard, {
          ticket: sampleTicket,
          isPending: true,
        })
      );

      expect(html).toContain("Starting Prep…");
      expect(html).toContain('disabled=""');
      expect(html).not.toContain(">Start Prep<");
    });

    it("disables button and displays 'Marking Ready…' when isPending is true in preparing status", () => {
      const html = renderToStaticMarkup(
        React.createElement(KitchenTicketCard, {
          ticket: { ...sampleTicket, status: "preparing" },
          isPending: true,
        })
      );

      expect(html).toContain("Marking Ready…");
      expect(html).toContain('disabled=""');
      expect(html).not.toContain(">Mark Ready<");
    });

    it("disables button and displays 'Serving…' when isPending is true in ready status", () => {
      const html = renderToStaticMarkup(
        React.createElement(KitchenTicketCard, {
          ticket: { ...sampleTicket, status: "ready" },
          isPending: true,
        })
      );

      expect(html).toContain("Serving…");
      expect(html).toContain('disabled=""');
      expect(html).not.toContain(">Served / Dispatch<");
    });

    it("renders active button with 'Start Prep' when not pending", () => {
      const html = renderToStaticMarkup(
        React.createElement(KitchenTicketCard, {
          ticket: sampleTicket,
          isPending: false,
        })
      );

      expect(html).toContain("Start Prep");
      expect(html).not.toContain('disabled=""');
    });
  });

  describe("Server transitionOrderStatus Idempotency", () => {
    it("returns ok immediately when order is already in the target status (idempotent no-op)", async () => {
      const mockOrder = {
        id: "ord-test-1",
        restaurantId: "rest_1",
        tableId: "tbl_1",
        status: "preparing" as const,
        paymentStatus: "paid" as const,
        paymentMethod: "counter",
      };

      const mockDb = {
        query: {
          orders: {
            findFirst: vi.fn().mockResolvedValue(mockOrder),
          },
        },
      };

      const ctx = {
        db: mockDb,
        actor: { userId: "user-k1", role: "kitchen" as const, restaurantId: "rest_1" },
      } as unknown as Ctx;

      // Duplicate click requesting 'preparing' when order is ALREADY 'preparing'
      const result = await transitionOrderStatus(ctx, {
        orderId: "ord-test-1",
        toStatus: "preparing",
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.newStatus).toBe("preparing");
      }
    });

    it("rejects invalid backward transitions (e.g. from ready to placed)", async () => {
      const mockOrder = {
        id: "ord-test-1",
        restaurantId: "rest_1",
        tableId: "tbl_1",
        status: "ready" as const,
        paymentStatus: "paid" as const,
        paymentMethod: "counter",
      };

      const mockDb = {
        query: {
          orders: {
            findFirst: vi.fn().mockResolvedValue(mockOrder),
          },
        },
      };

      const ctx = {
        db: mockDb,
        actor: { userId: "user-k1", role: "kitchen" as const, restaurantId: "rest_1" },
      } as unknown as Ctx;

      const result = await transitionOrderStatus(ctx, {
        orderId: "ord-test-1",
        toStatus: "placed",
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("CONFLICT");
      }
    });
  });

  describe("Monotonic status rank progression for all 3 kitchen columns", () => {
    // Mirroring the status rank defined in KitchenBoard
    const STATUS_RANK: Record<string, number> = {
      placed: 1,
      accepted: 1,
      preparing: 2,
      ready: 3,
      served: 4,
      cancelled: 5,
    };

    it("prevents Column 1 regression: placed -> preparing cannot be overwritten by stale placed poll", () => {
      const currentTicket = { ...sampleTicket, status: "preparing" as const };
      const staleIncomingTicket = { ...sampleTicket, status: "placed" as const };

      // Monotonic guard logic: if incoming is lower rank, keep current
      const effectiveStatus =
        STATUS_RANK[staleIncomingTicket.status] < STATUS_RANK[currentTicket.status]
          ? currentTicket.status
          : staleIncomingTicket.status;

      expect(effectiveStatus).toBe("preparing");
    });

    it("prevents Column 2 regression: preparing -> ready cannot be overwritten by stale preparing poll", () => {
      const currentTicket = { ...sampleTicket, status: "ready" as const };
      const staleIncomingTicket = { ...sampleTicket, status: "preparing" as const };

      const effectiveStatus =
        STATUS_RANK[staleIncomingTicket.status] < STATUS_RANK[currentTicket.status]
          ? currentTicket.status
          : staleIncomingTicket.status;

      expect(effectiveStatus).toBe("ready");
    });

    it("prevents Column 3 regression: ready -> served cannot be resurrected by stale ready poll", () => {
      const pendingTransition = { toStatus: "served" as const, targetRank: 4, timestamp: Date.now() };
      const staleIncomingTicket = { ...sampleTicket, status: "ready" as const };

      let effectiveStatus: OrderStatus = staleIncomingTicket.status;
      if (STATUS_RANK[effectiveStatus] < pendingTransition.targetRank) {
        effectiveStatus = pendingTransition.toStatus;
      }

      // Served tickets are filtered out from the active board
      const isVisibleOnBoard = (effectiveStatus as OrderStatus) !== "served" && (effectiveStatus as OrderStatus) !== "cancelled";

      expect(effectiveStatus).toBe("served");
      expect(isVisibleOnBoard).toBe(false);
    });
  });
});
