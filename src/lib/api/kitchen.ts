import { apiFetch, type ApiResult } from "./client";
import type {
  KitchenTicket,
  OrderStatus,
  TransitionOrderInput,
} from "./types";

/**
 * Lists all active kitchen tickets (placed, accepted, preparing, ready).
 */
export async function listTickets(opts?: {
  signal?: AbortSignal;
}): Promise<ApiResult<KitchenTicket[]>> {
  return apiFetch<KitchenTicket[]>("/api/v1/kitchen/tickets", {
    method: "GET",
    signal: opts?.signal,
  });
}

/**
 * Transitions an order status adhering strictly to VALID_TRANSITIONS.
 */
export async function transition(
  orderIdOrInput: string | TransitionOrderInput,
  statusOrOpts?: OrderStatus | { signal?: AbortSignal },
  opts?: { signal?: AbortSignal }
): Promise<ApiResult<{ newStatus: OrderStatus }>> {
  let orderId: string;
  let toStatus: OrderStatus;
  let signal: AbortSignal | undefined;

  if (typeof orderIdOrInput === "string") {
    orderId = orderIdOrInput;
    toStatus = statusOrOpts as OrderStatus;
    signal = opts?.signal;
  } else {
    orderId = orderIdOrInput.orderId;
    toStatus = orderIdOrInput.toStatus;
    signal = (statusOrOpts as { signal?: AbortSignal })?.signal;
  }

  return apiFetch<{ newStatus: OrderStatus }>(
    `/api/v1/kitchen/orders/${encodeURIComponent(orderId)}/transition`,
    {
      method: "POST",
      body: { toStatus },
      signal,
    }
  );
}

export const kitchenApi = {
  listTickets,
  transition,
};
