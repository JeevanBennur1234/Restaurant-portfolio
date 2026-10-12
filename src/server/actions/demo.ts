"use server";

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { orders, orderEvents, staffUsers, type OrderStatus } from "@/server/db/schema";
import { publishRealtimeEvent, getRestaurantChannel } from "@/server/realtime";
import { setStaffSessionCookie } from "@/server/auth";
import { env } from "@/server/env";
import { VALID_TRANSITIONS, NEXT_STEP_TRANSITIONS } from "@/server/order-status";

const simulateKitchenStepSchema = z.object({
  orderId: z.string().trim().min(1, "Order ID is required"),
  token: z.string().trim().min(1, "Table token is required"),
});

export interface SimulateKitchenStepResult {
  success: boolean;
  newStatus?: OrderStatus;
  error?: string;
}

/**
 * Server Action: Advance an order to the next valid kitchen status in demo preview.
 * Strictly forbidden unless env.DEMO_MODE === "true".
 * Requires that the table token owns the order.
 * Follows VALID_TRANSITIONS sequentially (never skips steps, never cancels).
 */
export async function simulateKitchenStepAction(
  orderId: string,
  token: string
): Promise<SimulateKitchenStepResult> {
  if (env.DEMO_MODE !== "true") {
    return { success: false, error: "Demo simulation is disabled" };
  }

  const validation = simulateKitchenStepSchema.safeParse({ orderId, token });
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message ?? "Invalid simulation parameters";
    return { success: false, error: errorMsg };
  }

  try {
    const dbOrder = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      with: { table: true },
    });

    if (!dbOrder) {
      return { success: false, error: "Order not found" };
    }

    // Verify that the table token owns the order
    if (dbOrder.table.qrToken !== token) {
      return { success: false, error: "Unauthorized access to order" };
    }

    // Determine the next valid status using the shared transition map
    const nextStatus = NEXT_STEP_TRANSITIONS[dbOrder.status];
    if (!nextStatus) {
      return {
        success: false,
        error: `Order at status '${dbOrder.status}' cannot be advanced further`,
      };
    }

    const allowedTransitions = VALID_TRANSITIONS[dbOrder.status] ?? [];
    if (!allowedTransitions.includes(nextStatus)) {
      return {
        success: false,
        error: `Invalid status transition: cannot move from '${dbOrder.status}' to '${nextStatus}'`,
      };
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await tx.insert(orderEvents).values({
        orderId,
        fromStatus: dbOrder.status,
        toStatus: nextStatus,
        note: `Demo simulation: kitchen advanced ticket to ${nextStatus}`,
      });
    });

    // Broadcast status change to kitchen and guest channels
    await publishRealtimeEvent(
      getRestaurantChannel(dbOrder.restaurantId),
      "order.status_changed",
      {
        orderId,
        fromStatus: dbOrder.status,
        toStatus: nextStatus,
      }
    );

    await publishRealtimeEvent(`order:${orderId}`, "order.status_changed", {
      orderId,
      status: nextStatus,
    });

    return { success: true, newStatus: nextStatus };
  } catch (err) {
    console.error("Database error in simulateKitchenStepAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}

const demoLoginRoleSchema = z.enum(["kitchen", "manager"]);

export interface DemoLoginResult {
  success: boolean;
  redirectTo?: string;
  error?: string;
}

/**
 * Server Action: Instant demo login for showcase visitors.
 * Works ONLY when DEMO_MODE === "true".
 * Logs in the seeded demo kitchen or manager user and sets staff session cookie.
 */
export async function demoLoginAction(
  rawRole: string
): Promise<DemoLoginResult> {
  if (env.DEMO_MODE !== "true") {
    return {
      success: false,
      error: "Demo login is only available when DEMO_MODE is true",
    };
  }

  const parsed = demoLoginRoleSchema.safeParse(rawRole);
  if (!parsed.success) {
    return {
      success: false,
      error: "Invalid demo role. Must be 'kitchen' or 'manager'",
    };
  }

  const role = parsed.data;

  try {
    const demoUser = await db.query.staffUsers.findFirst({
      where: and(
        eq(staffUsers.role, role),
        eq(staffUsers.isActive, true)
      ),
    });

    if (!demoUser) {
      return {
        success: false,
        error: `Demo user for role '${role}' not found in database.`,
      };
    }

    await setStaffSessionCookie(demoUser.id, demoUser.sessionVersion);

    return {
      success: true,
      redirectTo: role === "kitchen" ? "/kitchen" : "/admin",
    };
  } catch (err) {
    console.error("Database error in demoLoginAction:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}
