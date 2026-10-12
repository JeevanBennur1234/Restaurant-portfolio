import { sql } from "drizzle-orm";
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
 * Postgres-backed atomic rate limiter helper.
 * Uses a single atomic INSERT ... ON CONFLICT DO UPDATE ... RETURNING count, window_start.
 * Resets window count to 1 when windowMs has expired, otherwise increments count.
 * Eliminates read-then-write race conditions.
 */
export async function checkRateLimit(
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { key, limit, windowMs } = options;
  const now = new Date();

  const [row] = await db
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
        count: sql`CASE 
          WHEN ${loginAttempts.windowStart} + (${windowMs} * INTERVAL '1 millisecond') <= ${now} 
          THEN 1 
          ELSE ${loginAttempts.count} + 1 
        END`,
        windowStart: sql`CASE 
          WHEN ${loginAttempts.windowStart} + (${windowMs} * INTERVAL '1 millisecond') <= ${now} 
          THEN ${now} 
          ELSE ${loginAttempts.windowStart} 
        END`,
        updatedAt: now,
      },
    })
    .returning({
      count: loginAttempts.count,
      windowStart: loginAttempts.windowStart,
    });

  const count = row?.count ?? 1;
  const windowStart = row?.windowStart ?? now;
  const allowed = count <= limit;
  const windowElapsed = now.getTime() - windowStart.getTime();
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowMs - windowElapsed) / 1000)
  );

  return {
    allowed,
    count,
    remaining: Math.max(0, limit - count),
    ...(allowed ? {} : { retryAfterSeconds }),
  };
}
