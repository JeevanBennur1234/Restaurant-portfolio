import type { OrderStatus } from "@/server/db/schema";

/**
 * Valid transitions for order status state machine.
 * Shared between kitchen operations and demo simulations.
 */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["preparing", "accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

/**
 * Canonical sequential forward progression for orders (no skips, no cancellations).
 */
export const NEXT_STEP_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus>> = {
  placed: "preparing",
  accepted: "preparing",
  preparing: "ready",
  ready: "served",
};
