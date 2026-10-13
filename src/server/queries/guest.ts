import { db } from "@/server/db";
import {
  getMenuForTable,
  type GuestModifier,
  type GuestMenuItem,
  type GuestCategory,
  type GuestTable,
  type GuestRestaurant,
  type GuestMenuData,
} from "@/server/services/customer";

export type {
  GuestModifier,
  GuestMenuItem,
  GuestCategory,
  GuestTable,
  GuestRestaurant,
  GuestMenuData,
};

export type GuestQueryResult =
  | { success: true; data: GuestMenuData }
  | {
      success: false;
      error:
        | "INVALID_TOKEN"
        | "NOT_FOUND"
        | "INACTIVE_TABLE"
        | "Service temporarily unavailable";
    };

/**
 * Resolves a QR token to table and menu data via the customer service.
 */
export async function getGuestTableAndMenu(
  rawToken: string
): Promise<GuestQueryResult> {
  const result = await getMenuForTable({ db }, rawToken);
  if (result.ok) {
    return { success: true, data: result.data };
  }

  type GuestQueryError = Extract<GuestQueryResult, { success: false }>["error"];
  const validErrors: Record<string, GuestQueryError> = {
    INVALID_TOKEN: "INVALID_TOKEN",
    NOT_FOUND: "NOT_FOUND",
    INACTIVE_TABLE: "INACTIVE_TABLE",
  };

  return {
    success: false,
    error: validErrors[result.message] ?? "Service temporarily unavailable",
  };
}
