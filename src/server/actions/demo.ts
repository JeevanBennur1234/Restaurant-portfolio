"use server";

import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { staffUsers, type OrderStatus } from "@/server/db/schema";
import { setStaffSessionCookie } from "@/server/auth";
import { env } from "@/server/env";
import { simulateKitchenStep } from "@/server/services/demo";

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
  const result = await simulateKitchenStep({ db }, { orderId, token });
  if (result.ok) {
    return { success: true, newStatus: result.data.newStatus };
  }
  return { success: false, error: result.message };
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
        eq(staffUsers.isActive, true),
        eq(staffUsers.isDemo, true)
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
