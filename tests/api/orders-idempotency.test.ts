import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeIdempotentOrder, computeRequestHash } from "@/server/api/idempotency";
import { db } from "@/server/db";
import { idempotencyKeys } from "@/server/db/schema";
import { NextResponse } from "next/server";

type IdempotencyRow = typeof idempotencyKeys.$inferSelect;

describe("Orders Idempotency Execution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, "delete").mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    } as unknown as ReturnType<typeof db.delete>);
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

  it("deletes placeholder row and calls handler exactly once when handler throws", async () => {
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([{ key: "order-idem-throw-test" }]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const deleteWhereMock = vi.fn().mockResolvedValue([]);
    vi.spyOn(db, "delete").mockReturnValueOnce({
      where: deleteWhereMock,
    } as unknown as ReturnType<typeof db.delete>);

    const handler = vi.fn().mockRejectedValue(new Error("Database connection dropped"));

    await expect(
      executeIdempotentOrder({
        restaurantId: "rest-1",
        idempotencyKey: "order-idem-throw-test",
        body: { item: "biryani" },
        requestId: "req-throw-1",
        handler,
      })
    ).rejects.toThrow("Database connection dropped");

    expect(handler).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  it("does not cache 429 response and deletes placeholder row", async () => {
    vi.spyOn(db, "insert").mockReturnValueOnce({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValueOnce([{ key: "order-idem-429-test" }]),
        }),
      }),
    } as unknown as ReturnType<typeof db.insert>);

    const updateSpy = vi.spyOn(db, "update");
    const deleteWhereMock = vi.fn().mockResolvedValue([]);
    vi.spyOn(db, "delete").mockReturnValueOnce({
      where: deleteWhereMock,
    } as unknown as ReturnType<typeof db.delete>);

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json(
        { success: false, error: { code: "RATE_LIMITED", message: "Too many orders" } },
        { status: 429 }
      )
    );

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-429-test",
      body: { item: "biryani" },
      requestId: "req-429-1",
      handler,
    });

    expect(res.status).toBe(429);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(deleteWhereMock).toHaveBeenCalled();
  });

  it("reclaims stale in-flight placeholder older than 2 minutes and proceeds with execution", async () => {
    const body = { item: "biryani" };
    const requestHash = computeRequestHash(body);

    // 1. Initial insert conflicts because stale row already exists
    // 2. Re-insert after deleting stale placeholder succeeds
    vi.spyOn(db, "insert")
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: vi.fn().mockResolvedValueOnce([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.insert>)
      .mockReturnValueOnce({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: vi.fn().mockResolvedValueOnce([{ key: "order-idem-stale-test" }]),
          }),
        }),
      } as unknown as ReturnType<typeof db.insert>);

    // Find existing row: createdAt is 3 minutes ago, responseStatus is 0
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    vi.spyOn(db.query.idempotencyKeys, "findFirst").mockResolvedValueOnce({
      key: "order-idem-stale-test",
      restaurantId: "rest-1",
      requestHash,
      responseStatus: 0,
      responseBody: {},
      createdAt: threeMinutesAgo,
    } as unknown as IdempotencyRow);

    const deleteWhereMock = vi.fn().mockResolvedValue([]);
    vi.spyOn(db, "delete").mockReturnValue({
      where: deleteWhereMock,
    } as unknown as ReturnType<typeof db.delete>);

    vi.spyOn(db, "update").mockReturnValueOnce({
      set: () => ({
        where: vi.fn().mockResolvedValueOnce([]),
      }),
    } as unknown as ReturnType<typeof db.update>);

    const handler = vi.fn().mockResolvedValue(
      NextResponse.json({ success: true, data: { orderId: "ord-reclaimed" } }, { status: 201 })
    );

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-stale-test",
      body,
      requestId: "req-stale-1",
      handler,
    });

    expect(res.status).toBe(201);
    expect(deleteWhereMock).toHaveBeenCalled();
    expect(handler).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { success: boolean; data: { orderId: string } };
    expect(json.data.orderId).toBe("ord-reclaimed");
  });

  it("returns INTERNAL 500 and never calls handler if database errors before execution", async () => {
    vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("DB connection pool exhausted");
    });

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

    const res = await executeIdempotentOrder({
      restaurantId: "rest-1",
      idempotencyKey: "order-idem-dberr-test",
      body: { item: "biryani" },
      requestId: "req-dberr-1",
      handler,
    });

    expect(res.status).toBe(500);
    expect(handler).not.toHaveBeenCalled();
    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("INTERNAL");
  });
});
