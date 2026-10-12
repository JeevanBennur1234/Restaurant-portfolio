import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { loginAttempts } from "@/server/db/schema";

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds?: number;
}

/**
 * Postgres-backed rate limiter helper (reusing the login_attempts table approach).
 * Tracks request count and window start timestamp per unique key in PostgreSQL.
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { key, limit, windowMs } = options;
  const now = new Date();

  const record = await db.query.loginAttempts.findFirst({
    where: eq(loginAttempts.key, key),
  });

  if (!record || now.getTime() - record.windowStart.getTime() >= windowMs) {
    // Start a new window or reset expired window
    await db
      .insert(loginAttempts)
      .values({
        key,
        count: 1,
        windowStart: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: 1,
          windowStart: now,
          updatedAt: now,
        },
      });

    return {
      allowed: true,
      count: 1,
      remaining: Math.max(0, limit - 1),
    };
  }

  const windowElapsed = now.getTime() - record.windowStart.getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowMs - windowElapsed) / 1000)
  );

  if (record.count >= limit) {
    return {
      allowed: false,
      count: record.count,
      remaining: 0,
      retryAfterSeconds,
    };
  }

  // Increment within current window
  const newCount = record.count + 1;
  await db
    .update(loginAttempts)
    .set({
      count: newCount,
      updatedAt: now,
    })
    .where(eq(loginAttempts.key, key));

  return {
    allowed: true,
    count: newCount,
    remaining: Math.max(0, limit - newCount),
  };
}
