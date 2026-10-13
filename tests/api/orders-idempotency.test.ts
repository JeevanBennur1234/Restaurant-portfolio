import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeIdempotentOrder, computeRequestHash } from "@/server/api/idempotency";
import { db } from "@/server/db";
import { idempotencyKeys } from "@/server/db/schema";
import { NextResponse } from "next/server";

type IdempotencyRow = typeof idempotencyKeys.$inferSelect;

describe("Orders Idempotency Execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects keys that are too short (< 8 chars)", async () => {
    const handler = vi.fn();
    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "short",
      body: { item: "biryani" },
      requestId: "req-1",
      handler,
    });

    expect(res.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe("VALIDATION");
  });

  it("stores and executes new order on first request", async () => {
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([{ key: "order-idem-1234" }]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    vi.spyOn(db, "update").mockReturnValueOnce({
      set: () => ({
        where: vi.fn().mockResolvedValueOnce([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: { orderId: "ord-1" } }, { status: 201 })
    );

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-1234",
      body: { item: "biryani" },
      requestId: "req-1",
      handler,
    });

    expect(res.status).toBe(201);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("replays stored response with Idempotency-Replayed: true when called with same key and same body", async () => {
    const body = { item: "biryani", quantity: 2 };
    const requestHash = computeRequestHash(body);

    // First insert fails to return rows because row already exists (conflict do nothing)
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    // Existing row lookup finds previously completed response
    vi.spyOn(db.query.idempotencyKeys, "findFirst").mockResolvedValueOnce({
      key: "order-idem-1234",
      restaurantId: "rest-1",
      requestHash,
      responseStatus: 201,
      responseBody: { success: true, data: { orderId: "ord-1" } },
      createdAt: new Date(),
    } as unknown as IdempotencyRow);

    const handler = vi.fn();

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-1234",
      body,
      requestId: "req-2",
      handler,
    });

    expect(res.status).toBe(201);
    expect(res.headers.get("Idempotency-Replayed")).toBe("true");
    expect(handler).not.toHaveBeenCalled();

    const json = (await res.json()) as { success: boolean; data: { orderId: string } };
    expect(json.success).toBe(true);
    expect(json.data.orderId).toBe("ord-1");
  });

  it("returns 409 CONFLICT when key is reused with different request body", async () => {
    // Insert returns 0 rows (conflict)
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    // Existing row has different hash
    vi.spyOn(db.query.idempotencyKeys, "findFirst").mockResolvedValueOnce({
      key: "order-idem-1234",
      restaurantId: "rest-1",
      requestHash: "different-original-hash",
      responseStatus: 201,
      responseBody: { success: true },
      createdAt: new Date(),
    } as unknown as IdempotencyRow);

    const handler = vi.fn();

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-1234",
      body: { item: "chicken tikka" },
      requestId: "req-3",
      handler,
    });

    expect(res.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();

    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 409 CONFLICT when concurrent request is currently in-flight (responseStatus 0)", async () => {
    const body = { item: "biryani" };
    const requestHash = computeRequestHash(body);

    // Insert returns 0 rows (conflict)
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    // Existing row is still processing (status 0)
    vi.spyOn(db.query.idempotencyKeys, "findFirst").mockResolvedValueOnce({
      key: "order-idem-1234",
      restaurantId: "rest-1",
      requestHash,
      responseStatus: 0,
      responseBody: {},
      createdAt: new Date(),
    } as unknown as IdempotencyRow);

    const handler = vi.fn();

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-1234",
      body,
      requestId: "req-4",
      handler,
    });

    expect(res.status).toBe(409);
    expect(handler).not.toHaveBeenCalled();

    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("CONFLICT");
    expect(json.error.message).toContain("Concurrent request");
  });
});
