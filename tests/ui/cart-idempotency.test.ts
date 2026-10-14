import { describe, it, expect } from "vitest";
import {
  CartIdempotencyManager,
  createCartSignature,
  shouldRegenerateKeyOnResult,
  generateIdempotencyKey,
  type CartItemLike,
} from "@/components/guest/idempotency-key";
import type { ApiResult } from "@/lib/api/client";

describe("Cart Idempotency Key Management", () => {
  const sampleItems: CartItemLike[] = [
    { menuItemId: "item_1", quantity: 2, selectedModifierIds: ["mod_a", "mod_b"] },
    { menuItemId: "item_2", quantity: 1, selectedModifierIds: [] },
  ];

  it("same body + network error -> same key", () => {
    const manager = new CartIdempotencyManager(sampleItems, "pay_now", "no onions");
    const initialKey = manager.getKey();

    // Verify updating with identical inputs does not change key
    const updateRes = manager.updateInputs(sampleItems, "pay_now", "no onions");
    expect(updateRes.changed).toBe(false);
    expect(updateRes.key).toBe(initialKey);

    // Simulate network error result
    const networkErrorResult: ApiResult<unknown> = {
      ok: false,
      code: "NETWORK",
      message: "Network request failed",
      status: 0,
    };

    expect(shouldRegenerateKeyOnResult(networkErrorResult)).toBe(false);

    const handled = manager.handleResult(networkErrorResult);
    expect(handled.regenerated).toBe(false);
    expect(handled.key).toBe(initialKey);
    expect(manager.getKey()).toBe(initialKey);

    // Also test with 500 internal server error
    const server500Result: ApiResult<unknown> = {
      ok: false,
      code: "INTERNAL",
      message: "Database error",
      status: 500,
    };
    expect(shouldRegenerateKeyOnResult(server500Result)).toBe(false);
    const handled500 = manager.handleResult(server500Result);
    expect(handled500.regenerated).toBe(false);
    expect(handled500.key).toBe(initialKey);
  });

  it("notes changed -> new key", () => {
    const manager = new CartIdempotencyManager(sampleItems, "pay_now", "no onions");
    const initialKey = manager.getKey();

    // Change notes (e.g. "extra spicy")
    const updateRes = manager.updateInputs(sampleItems, "pay_now", "extra spicy");
    expect(updateRes.changed).toBe(true);
    expect(updateRes.key).not.toBe(initialKey);
    expect(manager.getKey()).toBe(updateRes.key);

    // Note that trimming whitespace should NOT change key if trimmed text matches
    const currentKey = manager.getKey();
    const whitespaceUpdate = manager.updateInputs(sampleItems, "pay_now", "  extra spicy  ");
    expect(whitespaceUpdate.changed).toBe(false);
    expect(whitespaceUpdate.key).toBe(currentKey);
  });

  it("paymentMethod changed -> new key", () => {
    const manager = new CartIdempotencyManager(sampleItems, "pay_now", "no onions");
    const initialKey = manager.getKey();

    // Change paymentMethod to "counter"
    const updateRes = manager.updateInputs(sampleItems, "counter", "no onions");
    expect(updateRes.changed).toBe(true);
    expect(updateRes.key).not.toBe(initialKey);
    expect(manager.getKey()).toBe(updateRes.key);
  });

  it("4xx -> new key", () => {
    const manager = new CartIdempotencyManager(sampleItems, "pay_now", "no onions");
    const initialKey = manager.getKey();

    // 400 VALIDATION
    const validationError: ApiResult<unknown> = {
      ok: false,
      code: "VALIDATION",
      message: "Invalid quantity",
      status: 400,
    };
    expect(shouldRegenerateKeyOnResult(validationError)).toBe(true);
    const res400 = manager.handleResult(validationError);
    expect(res400.regenerated).toBe(true);
    expect(res400.key).not.toBe(initialKey);

    // 409 CONFLICT
    const currentKey = manager.getKey();
    const conflictError: ApiResult<unknown> = {
      ok: false,
      code: "CONFLICT",
      message: "Item out of stock",
      status: 409,
    };
    expect(shouldRegenerateKeyOnResult(conflictError)).toBe(true);
    const res409 = manager.handleResult(conflictError);
    expect(res409.regenerated).toBe(true);
    expect(res409.key).not.toBe(currentKey);

    // 429 RATE_LIMITED
    const afterConflictKey = manager.getKey();
    const rateLimitedError: ApiResult<unknown> = {
      ok: false,
      code: "RATE_LIMITED",
      message: "Too many requests",
      status: 429,
    };
    expect(shouldRegenerateKeyOnResult(rateLimitedError)).toBe(true);
    const res429 = manager.handleResult(rateLimitedError);
    expect(res429.regenerated).toBe(true);
    expect(res429.key).not.toBe(afterConflictKey);
  });

  it("success -> new key", () => {
    const manager = new CartIdempotencyManager(sampleItems, "pay_now", "no onions");
    const initialKey = manager.getKey();

    const successResult: ApiResult<{ orderId: string; orderNumber: string }> = {
      ok: true,
      data: {
        orderId: "ord_123",
        orderNumber: "ML-1001",
      },
    };

    expect(shouldRegenerateKeyOnResult(successResult)).toBe(true);
    const handled = manager.handleResult(successResult);
    expect(handled.regenerated).toBe(true);
    expect(handled.key).not.toBe(initialKey);
    expect(manager.getKey()).toBe(handled.key);
  });

  it("createCartSignature is stable with modifier ordering and whitespace in notes", () => {
    const items1: CartItemLike[] = [
      { menuItemId: "m1", quantity: 1, selectedModifierIds: ["b", "a"] },
    ];
    const items2: CartItemLike[] = [
      { menuItemId: "m1", quantity: 1, selectedModifierIds: ["a", "b"] },
    ];

    expect(createCartSignature(items1, "pay_now", "note")).toBe(
      createCartSignature(items2, "pay_now", "  note  ")
    );
  });

  it("generateIdempotencyKey generates non-empty unique strings", () => {
    const k1 = generateIdempotencyKey();
    const k2 = generateIdempotencyKey();
    expect(k1).toBeTruthy();
    expect(k2).toBeTruthy();
    expect(k1).not.toBe(k2);
  });
});
