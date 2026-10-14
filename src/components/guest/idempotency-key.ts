import type { ApiResult } from "@/lib/api/client";

export interface CartItemLike {
  menuItemId: string;
  quantity: number;
  selectedModifierIds?: string[];
}

/**
 * Generates a random UUID (or pseudo-random fallback) for idempotency keys.
 */
export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Computes a deterministic signature of the full order payload.
 * Covers items (menuItemId, quantity, sorted selectedModifierIds), paymentMethod, and trimmed notes.
 */
export function createCartSignature(
  items: CartItemLike[],
  paymentMethod: string,
  notes: string
): string {
  return JSON.stringify({
    items: items.map((i) => [
      i.menuItemId,
      i.quantity,
      [...(i.selectedModifierIds ?? [])].sort(),
    ]),
    paymentMethod,
    notes: notes.trim(),
  });
}

/**
 * Decides whether to regenerate the idempotency key after placeOrder completes:
 * - On success: true (generate new key for subsequent order)
 * - On 4xx errors (VALIDATION, CONFLICT, RATE_LIMITED, NOT_FOUND, FORBIDDEN, etc.): true (generate new key)
 * - On NETWORK errors or 5xx server errors: false (preserve same key for retrying)
 */
export function shouldRegenerateKeyOnResult(result: ApiResult<unknown>): boolean {
  if (result.ok) {
    return true;
  }
  if (result.code === "NETWORK" || result.status >= 500) {
    return false;
  }
  if (
    (result.status >= 400 && result.status < 500) ||
    ["VALIDATION", "CONFLICT", "RATE_LIMITED", "NOT_FOUND", "FORBIDDEN", "UNAUTHENTICATED"].includes(result.code)
  ) {
    return true;
  }
  return false;
}

/**
 * Pure state manager for cart idempotency key lifecycle, suitable for unit testing.
 */
export class CartIdempotencyManager {
  private key: string;
  private signature: string;

  constructor(
    items: CartItemLike[] = [],
    paymentMethod = "pay_now",
    notes = "",
    initialKey?: string
  ) {
    this.key = initialKey ?? generateIdempotencyKey();
    this.signature = createCartSignature(items, paymentMethod, notes);
  }

  getKey(): string {
    return this.key;
  }

  getSignature(): string {
    return this.signature;
  }

  /**
   * Called when cart inputs change. If signature changed, a new key is generated.
   */
  updateInputs(
    items: CartItemLike[],
    paymentMethod: string,
    notes: string
  ): { key: string; changed: boolean } {
    const newSig = createCartSignature(items, paymentMethod, notes);
    if (newSig !== this.signature) {
      this.signature = newSig;
      this.key = generateIdempotencyKey();
      return { key: this.key, changed: true };
    }
    return { key: this.key, changed: false };
  }

  /**
   * Called after placeOrder returns. Regenerates key if result requires it.
   */
  handleResult(result: ApiResult<unknown>): { key: string; regenerated: boolean } {
    if (shouldRegenerateKeyOnResult(result)) {
      this.key = generateIdempotencyKey();
      return { key: this.key, regenerated: true };
    }
    return { key: this.key, regenerated: false };
  }
}
