"use server";

import { eq, inArray, desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
  orders,
  orderEvents,
  type OrderStatus,
} from "@/server/db/schema";
import {
  getStaffSession,
  authenticateStaff,
  clearStaffSessionCookie,
  type StaffSession,
} from "@/server/auth";
import { publishRealtimeEvent } from "@/server/realtime";
import { demoOrdersStore } from "@/server/demo-orders";

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
  status: OrderStatus;
  paymentStatus: "pending" | "paid" | "counter" | "failed";
  paymentMethod: "pay_now" | "counter" | null;
  createdAt: string;
  specialInstructions: string | null;
  items: KitchenTicketItem[];
}

// Zod validation schemas
const transitionInputSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID required"),
  toStatus: z.enum(["placed", "accepted", "preparing", "ready", "served", "cancelled"]),
});

const loginInputSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

// Enforce valid state transitions strictly on the server
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ["preparing", "accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["served", "cancelled"],
  served: [],
  cancelled: [],
};

/**
 * Checks if the caller has kitchen or manager authorization
 */
async function requireKitchenAuth(): Promise<StaffSession> {
  const session = await getStaffSession();
  if (!session) {
    throw new Error("Unauthorized: Staff authentication required");
  }
  if (session.role !== "kitchen" && session.role !== "manager" && session.role !== "admin") {
    throw new Error("Forbidden: Insufficient privileges for kitchen board");
  }
  return session;
}

/**
 * Server Action: Fetches all active kitchen tickets
 * Filters strictly for paid orders or pay-at-counter orders.
 */
export async function getKitchenTicketsAction(): Promise<{
  success: boolean;
  tickets?: KitchenTicket[];
  session?: StaffSession;
  error?: string;
}> {
  let session: StaffSession;
  try {
    session = await requireKitchenAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  // 1. Try DB query
  try {
    const activeStatuses: OrderStatus[] = ["placed", "accepted", "preparing", "ready"];
    const dbOrders = await db.query.orders.findMany({
      where: inArray(orders.status, activeStatuses),
      with: {
        table: true,
        items: true,
      },
      orderBy: [desc(orders.createdAt)],
    });

    if (dbOrders && dbOrders.length > 0) {
      // RULE: Orders are only sent to the kitchen once paid, or immediately for pay-at-counter
      const visibleOrders = dbOrders.filter(
        (o) => o.paymentStatus === "paid" || o.paymentStatus === "counter"
      );

      const tickets: KitchenTicket[] = visibleOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        tableNumber: o.table.tableNumber,
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

      return { success: true, tickets, session };
    }
  } catch (err) {
    console.warn("DB kitchen tickets query fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  const demoTickets: KitchenTicket[] = [];
  demoOrdersStore.forEach((o) => {
    // Only active statuses and paid / counter
    const isActive =
      o.status === "placed" ||
      o.status === "accepted" ||
      o.status === "preparing" ||
      o.status === "ready";

    const isVisible = o.paymentStatus === "paid" || o.paymentStatus === "counter";

    if (isActive && isVisible) {
      demoTickets.push({
        id: o.id,
        orderNumber: o.orderNumber,
        tableNumber: o.tableNumber,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
        specialInstructions: o.specialInstructions,
        items: o.items.map((i) => ({
          id: i.id,
          name: i.itemName,
          quantity: i.quantity,
          modifiers: i.selectedModifiers.map((m) => m.name),
          notes: i.notes,
        })),
      });
    }
  });

  // Sort oldest first for KDS queue priority
  demoTickets.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return { success: true, tickets: demoTickets, session };
}

/**
 * Server Action: Transitions an order status
 * Validates transition rules and logs to order_events.
 */
export async function transitionOrderStatusAction(
  rawInput: z.infer<typeof transitionInputSchema>
): Promise<{ success: boolean; newStatus?: OrderStatus; error?: string }> {
  const validation = transitionInputSchema.safeParse(rawInput);
  if (!validation.success) {
    return { success: false, error: "Invalid transition parameters" };
  }

  let session: StaffSession;
  try {
    session = await requireKitchenAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const { orderId, toStatus } = validation.data;

  // 1. Try DB transition
  try {
    const existing = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { restaurant: true, table: true },
    });

    if (existing) {
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(toStatus)) {
        return {
          success: false,
          error: `Invalid status transition: cannot move from '${existing.status}' to '${toStatus}'`,
        };
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: toStatus, updatedAt: new Date() })
          .where(eq(orders.id, orderId));

        await tx.insert(orderEvents).values({
          orderId,
          fromStatus: existing.status,
          toStatus,
          staffUserId: session.userId,
          note: `Kitchen ${session.username} moved ticket to ${toStatus}`,
        });
      });

      // Broadcast realtime event
      await publishRealtimeEvent(
        `restaurant:${existing.restaurantId}`,
        "order.status_changed",
        {
          orderId,
          fromStatus: existing.status,
          toStatus,
          orderNumber: existing.orderNumber,
          tableNumber: existing.table.tableNumber,
        }
      );

      await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
        orderId,
        status: toStatus,
      });

      return { success: true, newStatus: toStatus };
    }
  } catch (err) {
    console.warn("DB transition fallback:", (err as Error).message);
  }

  // 2. Demo fallback
  const demoOrder = demoOrdersStore.get(orderId);
  if (demoOrder) {
    const allowed = VALID_TRANSITIONS[demoOrder.status] ?? [];
    if (!allowed.includes(toStatus)) {
      return {
        success: false,
        error: `Invalid transition: cannot move from '${demoOrder.status}' to '${toStatus}'`,
      };
    }

    const fromStatus = demoOrder.status;
    demoOrder.status = toStatus;
    demoOrder.updatedAt = new Date();
    demoOrder.events.push({
      id: `evt-${Date.now()}`,
      fromStatus,
      toStatus,
      note: `Kitchen ${session.username} moved ticket to ${toStatus}`,
      createdAt: new Date(),
    });

    await publishRealtimeEvent(
      `restaurant:${demoOrder.restaurantId}`,
      "order.status_changed",
      {
        orderId,
        fromStatus,
        toStatus,
        orderNumber: demoOrder.orderNumber,
        tableNumber: demoOrder.tableNumber,
      }
    );

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: toStatus,
    });

    return { success: true, newStatus: toStatus };
  }

  return { success: false, error: "Order not found" };
}

/**
 * Server Action: Staff login
 */
export async function loginStaffAction(
  rawInput: z.infer<typeof loginInputSchema>
): Promise<{ success: boolean; session?: StaffSession; error?: string }> {
  const validation = loginInputSchema.safeParse(rawInput);
  if (!validation.success) {
    return { success: false, error: "Username and password required" };
  }

  const { username, password } = validation.data;
  return await authenticateStaff(username, password);
}

/**
 * Server Action: Staff logout
 */
export async function logoutStaffAction(): Promise<{ success: boolean }> {
  await clearStaffSessionCookie();
  return { success: true };
}
