import { describe, it, expect } from "vitest";
import { ok, fail, type ServiceResult } from "./result";

describe("ServiceResult helpers", () => {
  it("creates a successful ServiceResult with ok helper", () => {
    const data = { id: "123", name: "Masala Chai" };
    const result = ok(data);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(data);
    }
  });

  it("creates an error ServiceResult with fail helper", () => {
    const result: ServiceResult<{ id: string }> = fail(
      "NOT_FOUND",
      "Order not found",
      404
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NOT_FOUND");
      expect(result.message).toBe("Order not found");
      expect(result.status).toBe(404);
    }
  });

  it("handles different ErrorCode values correctly", () => {
    const validationError = fail("VALIDATION", "Invalid payload", 400);
    const unauthenticatedError = fail("UNAUTHENTICATED", "Login required", 401);
    const forbiddenError = fail("FORBIDDEN", "Forbidden", 403);
    const rateLimitedError = fail("RATE_LIMITED", "Too many requests", 429);
    const conflictError = fail("CONFLICT", "Status transition invalid", 409);
    const paymentError = fail("PAYMENT", "Payment gateway failed", 402);
    const internalError = fail("INTERNAL", "Server error", 500);

    expect(validationError.ok).toBe(false);
    expect(unauthenticatedError.ok).toBe(false);
    expect(forbiddenError.ok).toBe(false);
    expect(rateLimitedError.ok).toBe(false);
    expect(conflictError.ok).toBe(false);
    expect(paymentError.ok).toBe(false);
    expect(internalError.ok).toBe(false);
  });
});
