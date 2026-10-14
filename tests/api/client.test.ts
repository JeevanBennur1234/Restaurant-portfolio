import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch } from "@/lib/api/client";
import { userMessageFor } from "@/lib/api/errors";
import { customerApi } from "@/lib/api/customer";
import { authApi } from "@/lib/api/auth";
import { kitchenApi } from "@/lib/api/kitchen";

describe("Typed API Client (src/lib/api/)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("handles success envelope correctly ({ success: true, data })", async () => {
    const mockData = { id: "order_123", totalPaise: 45000 };
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({ success: true, data: mockData }),
    } as unknown as Response);

    const result = await apiFetch<typeof mockData>("/api/v1/customer/orders/order_123");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(mockData);
    }
  });

  it("handles error envelope correctly ({ success: false, error: { code, message } })", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      headers: new Headers({ "Content-Type": "application/json" }),
      json: async () => ({
        success: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Staff authentication required",
        },
      }),
    } as unknown as Response);

    const result = await apiFetch("/api/v1/kitchen/tickets");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHENTICATED");
      expect(result.message).toBe("Staff authentication required");
      expect(result.status).toBe(401);
    }
  });

  it("handles 429 RATE_LIMITED and extracts Retry-After header", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      headers: new Headers({
        "Content-Type": "application/json",
        "Retry-After": "45",
      }),
      json: async () => ({
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Rate limit exceeded. Try again in 45 seconds.",
        },
      }),
    } as unknown as Response);

    const result = await apiFetch("/api/v1/kitchen/tickets");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("RATE_LIMITED");
      expect(result.status).toBe(429);
      expect(result.retryAfter).toBe(45);
    }
  });

  it("never throws on network failures and returns code 'NETWORK' with status 0", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await apiFetch("/api/v1/customer/tables/t123/menu");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NETWORK");
      expect(result.status).toBe(0);
      expect(result.message).toContain("Failed to fetch");
    }
  });

  it("never throws on non-JSON response body (e.g. 502 HTML) and returns NETWORK", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 502,
      headers: new Headers({ "Content-Type": "text/html" }),
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON at position 0");
      },
    } as unknown as Response);

    const result = await apiFetch("/api/v1/customer/orders/order_123");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NETWORK");
      expect(result.status).toBe(502);
      expect(result.message).toContain("Invalid JSON");
    }
  });

  it("injects x-table-token and Idempotency-Key headers and sets same-origin credentials", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve({
        status: 201,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          success: true,
          data: { orderId: "ord_1", orderNumber: "101" },
        }),
      });
    });

    const result = await apiFetch("/api/v1/customer/tables/token_abc/orders", {
      method: "POST",
      tableToken: "token_abc",
      idempotencyKey: "idem_key_uuid_123",
      body: { paymentMethod: "counter", items: [] },
    });

    expect(result.ok).toBe(true);
    expect(capturedUrl).toBe("/api/v1/customer/tables/token_abc/orders");
    expect(capturedInit?.credentials).toBe("same-origin");
    expect(capturedInit?.method).toBe("POST");

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["x-table-token"]).toBe("token_abc");
    expect(headers["Idempotency-Key"]).toBe("idem_key_uuid_123");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Accept"]).toBe("application/json");
  });

  it("handles caller-provided signal cancellation gracefully", async () => {
    const controller = new AbortController();
    controller.abort(new Error("User cancelled"));

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new Error("This operation was aborted"));
      }
      return Promise.resolve({
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({ success: true, data: {} }),
      });
    });

    const result = await apiFetch("/api/v1/customer/tables/t1/menu", {
      signal: controller.signal,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("NETWORK");
    }
  });

  it("re-sends the same Idempotency-Key on retry after failure, but changes key after success", async () => {
    const sentKeys: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      const headers = init?.headers as Record<string, string>;
      sentKeys.push(headers["Idempotency-Key"]);

      // First call fails with 500
      if (sentKeys.length === 1) {
        return Promise.resolve({
          status: 500,
          headers: new Headers({ "Content-Type": "application/json" }),
          json: async () => ({
            success: false,
            error: { code: "INTERNAL", message: "Temporary failure" },
          }),
        });
      }

      // Subsequent call succeeds
      return Promise.resolve({
        status: 201,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          success: true,
          data: { orderId: "ord_1", orderNumber: "101" },
        }),
      });
    });

    // Simulated checkout flow
    let currentKey = "key_attempt_1";

    // Attempt 1: fails
    const attempt1 = await customerApi.placeOrder(
      "token_1",
      { items: [], paymentMethod: "counter" },
      { idempotencyKey: currentKey }
    );
    expect(attempt1.ok).toBe(false);

    // Retry with SAME key after failure
    const attempt2 = await customerApi.placeOrder(
      "token_1",
      { items: [], paymentMethod: "counter" },
      { idempotencyKey: currentKey }
    );
    expect(attempt2.ok).toBe(true);

    // After success, new key is generated for next order
    currentKey = "key_attempt_2";
    const attempt3 = await customerApi.placeOrder(
      "token_1",
      { items: [], paymentMethod: "counter" },
      { idempotencyKey: currentKey }
    );
    expect(attempt3.ok).toBe(true);

    expect(sentKeys[0]).toBe("key_attempt_1");
    expect(sentKeys[1]).toBe("key_attempt_1"); // Reused!
    expect(sentKeys[2]).toBe("key_attempt_2"); // New key!
  });

  it("authApi and kitchenApi wrappers call the correct endpoints", async () => {
    let capturedUrl = "";
    let capturedMethod = "";

    globalThis.fetch = vi.fn().mockImplementation((url, init) => {
      capturedUrl = String(url);
      capturedMethod = init?.method || "GET";
      return Promise.resolve({
        status: 200,
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({ success: true, data: [] }),
      });
    });

    await authApi.login("chef_ramsay", "secret");
    expect(capturedUrl).toBe("/api/v1/auth/login");
    expect(capturedMethod).toBe("POST");

    await authApi.logout();
    expect(capturedUrl).toBe("/api/v1/auth/logout");
    expect(capturedMethod).toBe("POST");

    await authApi.me();
    expect(capturedUrl).toBe("/api/v1/auth/me");
    expect(capturedMethod).toBe("GET");

    await kitchenApi.listTickets();
    expect(capturedUrl).toBe("/api/v1/kitchen/tickets");
    expect(capturedMethod).toBe("GET");

    await kitchenApi.transition("ord_99", "preparing");
    expect(capturedUrl).toBe("/api/v1/kitchen/orders/ord_99/transition");
    expect(capturedMethod).toBe("POST");
  });

  it("maps error codes correctly via userMessageFor", () => {
    expect(userMessageFor("RATE_LIMITED")).toContain("Too many orders");
    expect(userMessageFor("PAYMENT")).toContain("Could not initialize payment");
    expect(userMessageFor("NETWORK")).toContain("Network error");
    expect(userMessageFor("VALIDATION")).toContain("Invalid order details");
    expect(userMessageFor("FORBIDDEN")).toContain("Unauthorized table session");
    expect(userMessageFor("UNAUTHENTICATED")).toContain("Authentication required");
    expect(userMessageFor("INTERNAL")).toContain("Could not place order");

    // Fallback when unrecognized
    expect(
      userMessageFor(
        "UNKNOWN" as unknown as Parameters<typeof userMessageFor>[0],
        "My custom fallback"
      )
    ).toBe("My custom fallback");
  });
});
