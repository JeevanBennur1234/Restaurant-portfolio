import { eq, and, inArray, asc } from "drizzle-orm";
import { z } from "zod";
import {
  orders,
  orderEvents,
  type OrderStatus,
} from "@/server/db/schema";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { VALID_TRANSITIONS } from "@/server/order-status";
import { ok, fail, type ServiceResult, type Ctx } from "./result";

export interface KitchenTicketItem {
  id: string;
  name: string;
  quantity: number;
  modifiers: string[];
  notes: string | null;
}

export interface KitchenTicket {
  id: string;
  orderNumber: string;
  tableNumber: string;
  roundNumber?: number;
  diningSessionId?: string | null;
  status: OrderStatus;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: "pay_now" | "counter" | null;
  createdAt: string;
  specialInstructions: string | null;
  items: KitchenTicketItem[];
}

const transitionInputSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID required"),
  toStatus: z.enum(["placed", "accepted", "preparing", "ready", "served", "cancelled"]),
});

export type TransitionOrderInput = z.infer<typeof transitionInputSchema>;

/**
 * Fetches all active kitchen tickets scoped to the actor's restaurant.
 */
export async function listKitchenTickets(
  ctx: Ctx
): Promise<ServiceResult<KitchenTicket[]>> {
  if (!ctx.actor) {
    return fail("UNAUTHENTICATED", "Unauthorized: Staff authentication required", 401);
  }

  if (
    ctx.actor.role !== "kitchen" &&
    ctx.actor.role !== "manager" &&
    ctx.actor.role !== "admin"
  ) {
    return fail("FORBIDDEN", "Forbidden: Insufficient privileges for kitchen board", 403);
  }

  try {
    const activeStatuses: OrderStatus[] = ["placed", "accepted", "preparing", "ready"];
    const dbOrders = await ctx.db.query.orders.findMany({
      where: and(
        eq(orders.restaurantId, ctx.actor.restaurantId),
        inArray(orders.status, activeStatuses)
      ),
      with: {
        table: true,
        items: true,
      },
      orderBy: [asc(orders.createdAt)],
    });

    // RULE: Orders are only sent to the kitchen once paid, or immediately for pay-at-counter or open tab
    const visibleOrders = dbOrders.filter(
      (o) => o.paymentStatus === "paid" || o.paymentStatus === "counter" || Boolean(o.diningSessionId)
    );

    const tickets: KitchenTicket[] = visibleOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      tableNumber: o.table.tableNumber,
      roundNumber: o.roundNumber || 1,
      diningSessionId: o.diningSessionId,
      status: o.status,
      paymentStatus: (o.paymentStatus as KitchenTicket["paymentStatus"]) || "pending",
      paymentMethod: (o.paymentMethod as KitchenTicket["paymentMethod"]) || null,
      createdAt: o.createdAt.toISOString(),
      specialInstructions: o.specialInstructions,
      items: o.items.map((i) => {
        let modNames: string[] = [];
        if (i.selectedModifiersJson) {
          try {
            const parsed = JSON.parse(i.selectedModifiersJson) as Array<{ name: string }>;
            modNames = parsed.map((m) => m.name);
          } catch {
            modNames = [];
          }
        }
        return {
          id: i.id,
          name: i.itemName,
          quantity: i.quantity,
          modifiers: modNames,
          notes: i.notes,
        };
      }),
    }));

    return ok(tickets);
  } catch (err) {
    console.error("Database error in listKitchenTickets service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}

/**
 * Transitions an order status adhering strictly to VALID_TRANSITIONS.
 */
export async function transitionOrderStatus(
  ctx: Ctx,
  rawInput: TransitionOrderInput
): Promise<ServiceResult<{ newStatus: OrderStatus }>> {
  const validation = transitionInputSchema.safeParse(rawInput);
  if (!validation.success) {
    return fail("VALIDATION", "Invalid transition parameters", 400);
  }

  if (!ctx.actor) {
    return fail("UNAUTHENTICATED", "Unauthorized: Staff authentication required", 401);
  }

  if (
    ctx.actor.role !== "kitchen" &&
    ctx.actor.role !== "manager" &&
    ctx.actor.role !== "admin"
  ) {
    return fail("FORBIDDEN", "Forbidden: Insufficient privileges for kitchen board", 403);
  }

  const { orderId, toStatus } = validation.data;

  try {
    const existing = await ctx.db.query.orders.findFirst({
      where: and(
        eq(orders.id, orderId),
        eq(orders.restaurantId, ctx.actor.restaurantId)
      ),
      with: { restaurant: true, table: true },
    });

    if (!existing) {
      return fail("NOT_FOUND", "Order not found", 404);
    }

    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(toStatus)) {
      return fail(
        "CONFLICT",
        `Invalid status transition: cannot move from '${existing.status}' to '${toStatus}'`,
        400
      );
    }

    // Kitchen Payment Security:
    // Block pending/failed pay_now orders from advancing through kitchen states.
    // Allow valid paid and pay-at-counter orders.
    const isPaid = existing.paymentStatus === "paid";
    const isCounter =
      existing.paymentStatus === "counter" ||
      existing.paymentMethod === "counter";

    if (!isPaid && !isCounter) {
      return fail(
        "CONFLICT",
        `Cannot transition order: payment is ${existing.paymentStatus}. Online pay_now orders must be paid before kitchen processing.`,
        409
      );
    }

    let concurrencyFailed = false;

    await ctx.db.transaction(async (tx) => {
      const updateResult = await tx
        .update(orders)
        .set({ status: toStatus, updatedAt: new Date() })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, existing.status)
          )
        );

      const rowCount = (updateResult as unknown as { rowCount?: number })
        ?.rowCount;
      if (typeof rowCount === "number" && rowCount === 0) {
        concurrencyFailed = true;
        return;
      }

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: existing.status,
        toStatus,
        staffUserId: ctx.actor!.userId,
        note: `Kitchen ${ctx.actor!.username ?? ctx.actor!.role} moved ticket to ${toStatus}`,
      });
    });

    if (concurrencyFailed) {
      return fail(
        "CONFLICT",
        "Order status was modified concurrently by another request",
        409
      );
    }

    // Broadcast realtime event
    await publishRealtimeEvent(
      getRestaurantChannel(existing.restaurantId),
      "order.status_changed",
      {
        orderId,
        fromStatus: existing.status,
        toStatus,
      }
    );

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: toStatus,
    });

    return ok({ newStatus: toStatus });
  } catch (err) {
    console.error("Database error in transitionOrderStatus service:", err);
    return fail("INTERNAL", "Service temporarily unavailable", 500);
  }
}
