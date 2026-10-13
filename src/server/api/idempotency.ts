import crypto from "crypto";
import { eq, and, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { idempotencyKeys } from "@/server/db/schema";
import { apiError } from "./envelope";

export function computeRequestHash(body: unknown): string {
  const normalized =
    typeof body === "string" ? body : JSON.stringify(body ?? {});
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Opportunistically deletes idempotency keys older than 24 hours.
 */
export async function cleanupExpiredIdempotencyKeys(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await db.delete(idempotencyKeys).where(lt(idempotencyKeys.createdAt, cutoff));
  } catch (err) {
    console.error("Opportunistic cleanup of idempotency keys failed:", err);
  }
}

/**
 * Wraps order creation with atomic idempotency replay & conflict protection.
 */
export async function executeIdempotentOrder(options: {
  restaurantId: string;
  idempotencyKey?: string | null;
  body: unknown;
  requestId: string;
  handler: () => Promise<NextResponse>;
}): Promise<NextResponse> {
  const { restaurantId, idempotencyKey, body, requestId, handler } = options;

  // 1. If no key is provided, execute normally without idempotency tracking
  if (!idempotencyKey) {
    return await handler();
  }

  // 2. Validate header length (8-128 characters)
  const trimmedKey = idempotencyKey.trim();
  if (trimmedKey.length < 8 || trimmedKey.length > 128) {
    return apiError(
      "VALIDATION",
      "Idempotency-Key must be between 8 and 128 characters",
      400,
      { "x-request-id": requestId }
    );
  }

  const requestHash = computeRequestHash(body);

  // 3. Opportunistic cleanup of expired keys in background
  cleanupExpiredIdempotencyKeys().catch(() => {});

  // 4. Atomically insert placeholder key before order creation
  try {
    const [inserted] = await db
      .insert(idempotencyKeys)
      .values({
        key: trimmedKey,
        restaurantId,
        requestHash,
        responseStatus: 0,
        responseBody: {},
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      // Key already exists in database
      const existing = await db.query.idempotencyKeys.findFirst({
        where: and(
          eq(idempotencyKeys.restaurantId, restaurantId),
          eq(idempotencyKeys.key, trimmedKey)
        ),
      });

      if (!existing) {
        return apiError("CONFLICT", "Idempotency conflict detected", 409, {
          "x-request-id": requestId,
        });
      }

      // Conflict: same key, different request body
      if (existing.requestHash !== requestHash) {
        return apiError(
          "CONFLICT",
          "Idempotency key already used with different request parameters",
          409,
          { "x-request-id": requestId }
        );
      }

      // Concurrent request in flight with same key and same body
      if (existing.responseStatus === 0) {
        return apiError(
          "CONFLICT",
          "Concurrent request in progress with this Idempotency-Key",
          409,
          { "x-request-id": requestId }
        );
      }

      // Replay stored response
      return NextResponse.json(existing.responseBody, {
        status: existing.responseStatus,
        headers: {
          "Cache-Control": "no-store",
          "Idempotency-Replayed": "true",
          "x-request-id": requestId,
        },
      });
    }

    // 5. This is the first request: execute order handler
    const response = await handler();

    // 6. Update idempotency key with response status and body
    try {
      const cloned = response.clone();
      const responseData = await cloned.json();

      await db
        .update(idempotencyKeys)
        .set({
          responseStatus: response.status,
          responseBody: responseData,
        })
        .where(
          and(
            eq(idempotencyKeys.restaurantId, restaurantId),
            eq(idempotencyKeys.key, trimmedKey)
          )
        );
    } catch (storeErr) {
      console.error("Failed to store idempotency response body:", storeErr);
    }

    return response;
  } catch (err) {
    console.error("Database error in idempotency handling:", err);
    return await handler();
  }
}
