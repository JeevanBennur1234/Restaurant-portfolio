"use server";

import { z } from "zod";
import { db } from "@/server/db";
import { type OrderStatus } from "@/server/db/schema";
import {
  getStaffSession,
  authenticateStaff,
  clearStaffSessionCookie,
  type StaffSession,
} from "@/server/auth";
import {
  listKitchenTickets,
  transitionOrderStatus,
  type KitchenTicket,
  type KitchenTicketItem,
  type TransitionOrderInput,
} from "@/server/services/kitchen";

export type {
  KitchenTicketItem,
  KitchenTicket,
  TransitionOrderInput,
};

const loginInputSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

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
 * Server Action: Fetches all active kitchen tickets via kitchen service
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

  const result = await listKitchenTickets({
    db,
    actor: session,
  });

  if (result.ok) {
    return {
      success: true,
      tickets: result.data,
      session,
    };
  }

  return {
    success: false,
    error: result.message,
  };
}

/**
 * Server Action: Transitions an order status via kitchen service
 */
export async function transitionOrderStatusAction(
  rawInput: TransitionOrderInput
): Promise<{ success: boolean; newStatus?: OrderStatus; error?: string }> {
  let session: StaffSession;
  try {
    session = await requireKitchenAuth();
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }

  const result = await transitionOrderStatus(
    { db, actor: session },
    rawInput
  );

  if (result.ok) {
    return {
      success: true,
      newStatus: result.data.newStatus,
    };
  }

  return {
    success: false,
    error: result.message,
  };
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
