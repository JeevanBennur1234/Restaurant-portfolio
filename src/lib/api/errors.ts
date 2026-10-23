import type { ApiErrorCode } from "./types";

export const ERROR_MESSAGES: Record<ApiErrorCode | "NETWORK", string> = {
  RATE_LIMITED:
    "Too many orders placed from this table. Please wait a few minutes.",
  PAYMENT:
    "Could not initialize payment. Please retry or choose Pay at counter.",
  VALIDATION: "Invalid order details. Please review your cart and try again.",
  NOT_FOUND: "Could not locate the requested order.",
  CONFLICT: "Order status has changed. Please refresh the page and try again.",
  FORBIDDEN:
    "Unauthorized table session. Please scan your table QR code again.",
  UNAUTHENTICATED: "Authentication required. Please sign in to continue.",
  TAB_ROUND_NOT_PAYABLE:
    "This order belongs to an open dining tab and cannot be paid individually. Please settle the whole tab.",
  INTERNAL: "Could not place order. Please try again.",
  NETWORK: "Network error. Please check your internet connection and retry.",
};

/**
 * Maps each API error code to the friendly copy shown in the UI.
 * Returns `fallback` if the code is unrecognized or not mapped.
 */
export function userMessageFor(
  code: ApiErrorCode | "NETWORK",
  fallback?: string
): string {
  return ERROR_MESSAGES[code] || fallback || "An unexpected error occurred.";
}
