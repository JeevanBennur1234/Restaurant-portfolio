import { cookies, headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cache } from "react";
import { db } from "@/server/db";
import { staffUsers, loginAttempts, type StaffRole } from "@/server/db/schema";
import { env } from "@/server/env";
import {
  getSite,
  allowedRolesForSite,
  sessionCookieNameForSite,
} from "@/server/site";

export interface StaffSession {
  userId: string;
  username: string;
  role: StaffRole;
  restaurantId: string;
  restaurantName: string;
  isDemo: boolean;
}

export interface SessionPayload {
  userId: string;
  sessionVersion: number;
  iat: number;
  exp: number;
  aud?: string;
}

export const SESSION_COOKIE_NAME = "dinepulse_staff_session";

// Pre-computed bcrypt hash (10 rounds) to equalize response time when username does not exist
const DUMMY_HASH =
  "$2a$10$wN31rO4uM2hR/p8qZ9/3Eee16GZJ0Xq9B4C7z4JtF01Z6N9dJ2bO6";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Extracts client IP from incoming request headers.
 * Only trusts x-forwarded-for when running on Vercel (process.env.VERCEL),
 * otherwise falls back to a fixed key to prevent IP spoofing in self-hosted environments.
 */
export async function getClientIp(): Promise<string> {
  if (process.env.VERCEL) {
    try {
      const headerList = await headers();
      const forwardedFor = headerList.get("x-forwarded-for");
      if (forwardedFor) {
        return forwardedFor.split(",")[0].trim();
      }
      const realIp = headerList.get("x-real-ip");
      if (realIp) {
        return realIp.trim();
      }
    } catch {
      // Fallback when headers() is outside request lifecycle (e.g., unit test)
    }
  }
  return "127.0.0.1";
}

/**
 * Encodes and signs a session payload
 */
export function signSessionPayload(payload: SessionPayload): string {
  const fullPayload: SessionPayload = {
    ...payload,
    aud: payload.aud ?? getSite(),
  };
  const json = JSON.stringify(fullPayload);
  const base64 = Buffer.from(json).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(base64)
    .digest("base64url");
  return `${base64}.${signature}`;
}

/**
 * Verifies and decodes a session token.
 * Uses crypto.timingSafeEqual and rejects expired tokens (exp 12h).
 * Rejects tokens whose aud differs from the expected/current site.
 */
export function verifySessionToken(
  token: string,
  expectedAud?: string
): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [base64, signature] = parts;

    const expectedSig = crypto
      .createHmac("sha256", env.SESSION_SECRET)
      .update(base64)
      .digest("base64url");

    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expectedBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

    const json = Buffer.from(base64, "base64url").toString("utf-8");
    const payload = JSON.parse(json) as SessionPayload;

    if (
      !payload.userId ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now >= payload.exp) {
      return null; // Expired token
    }

    const currentAud = expectedAud ?? getSite();
    if (!payload.aud || payload.aud !== currentAud) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Cached lookup for staff user per request using React cache()
 */
const getCachedStaffUserById = cache(async (userId: string) => {
  return await db.query.staffUsers.findFirst({
    where: eq(staffUsers.id, userId),
    with: { restaurant: true },
  });
});

/**
 * Retrieves the current staff session.
 * Loads the user from the DB on every call (cached per request with React cache()).
 * Rejects if user missing or isActive is false. Takes role and restaurant strictly from DB row.
 */
export async function getStaffSession(): Promise<StaffSession | null> {
  try {
    const cookieJar = await cookies();
    const cookieName = sessionCookieNameForSite(getSite());
    const sessionCookie = cookieJar.get(cookieName);
    if (!sessionCookie) return null;

    const payload = verifySessionToken(sessionCookie.value);
    if (!payload) return null;

    const user = await getCachedStaffUserById(payload.userId);
    if (!user || !user.isActive) return null;

    // Role check: ensure user's role is allowed on this site
    const allowed = allowedRolesForSite(getSite());
    if (!allowed.includes(user.role)) {
      return null;
    }

    // Invalidate old sessions when sessionVersion has changed
    if (
      payload.sessionVersion !== undefined &&
      user.sessionVersion !== payload.sessionVersion
    ) {
      return null;
    }

    // Invalidate old sessions when password/profile updatedAt timestamp is newer than session iat
    const userUpdatedAtSec = Math.floor(user.updatedAt.getTime() / 1000);
    if (userUpdatedAtSec > payload.iat) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      role: user.role,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant.name,
      isDemo: user.isDemo ?? false,
    };
  } catch (err) {
    if (typeof err === "object" && err !== null && "digest" in err) {
      throw err;
    }
    console.error("Error retrieving staff session:", err);
    return null;
  }
}

/**
 * Sets staff session cookie with only { userId, sessionVersion, iat, exp }
 */
export async function setStaffSessionCookie(
  userId: string,
  sessionVersion: number = 1
): Promise<void> {
  const cookieJar = await cookies();
  const now = Math.floor(Date.now() / 1000);
  const currentSite = getSite();
  const payload: SessionPayload = {
    userId,
    sessionVersion,
    iat: now,
    exp: now + 12 * 60 * 60, // 12 hours
    aud: currentSite,
  };
  const token = signSessionPayload(payload);
  const cookieName = sessionCookieNameForSite(currentSite);
  cookieJar.set(cookieName, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  });
}

/**
 * Clears staff session cookie for the current site
 */
export async function clearStaffSessionCookie(): Promise<void> {
  const cookieJar = await cookies();
  const cookieName = sessionCookieNameForSite(getSite());
  cookieJar.delete(cookieName);
}

/**
 * Invalidates active sessions for a staff member by bumping session_version
 */
export async function invalidateStaffSessions(userId: string): Promise<void> {
  const user = await db.query.staffUsers.findFirst({
    where: eq(staffUsers.id, userId),
  });
  if (user) {
    await db
      .update(staffUsers)
      .set({
        sessionVersion: user.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(staffUsers.id, userId));
  }
}

async function recordFailedAttempt(key: string, now: Date): Promise<number> {
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
          WHEN ${loginAttempts.windowStart} + (${RATE_LIMIT_WINDOW_MS} * INTERVAL '1 millisecond') <= ${now} 
          THEN 1 
          ELSE ${loginAttempts.count} + 1 
        END`,
        windowStart: sql`CASE 
          WHEN ${loginAttempts.windowStart} + (${RATE_LIMIT_WINDOW_MS} * INTERVAL '1 millisecond') <= ${now} 
          THEN ${now} 
          ELSE ${loginAttempts.windowStart} 
        END`,
        updatedAt: now,
      },
    })
    .returning({
      count: loginAttempts.count,
    });

  return row?.count ?? 1;
}

async function clearFailedAttempts(key: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.key, key));
}

/**
 * Authenticates staff credentials against database with:
 * - Anti-timing attack dummy hash comparison
 * - Database-backed rate limiting (5 failed attempts per username+IP per 15 min)
 * - Strict rejection of fallback credentials and database failures
 * - Role authorization check for the current site
 */
export async function authenticateStaff(
  username: string,
  plainPassword: string,
  clientIp?: string
): Promise<{ success: boolean; session?: StaffSession; error?: string }> {
  try {
    const ip = clientIp ?? (await getClientIp());
    const rateLimitKey = `${username.toLowerCase().trim()}:${ip}`;
    const now = new Date();

    // 1. Reserve attempt BEFORE checking password (atomic upsert)
    const count = await recordFailedAttempt(rateLimitKey, now);
    if (count > MAX_FAILED_ATTEMPTS) {
      return {
        success: false,
        error: "Too many failed login attempts. Please try again in 15 minutes.",
      };
    }

    // 2. Query user from DB
    const user = await db.query.staffUsers.findFirst({
      where: eq(staffUsers.username, username),
      with: { restaurant: true },
    });

    // 3. Timing-safe compare: always compare so timing does not leak username existence
    let isMatch = false;
    if (user && user.isActive) {
      isMatch = await bcrypt.compare(plainPassword, user.passwordHash);
    } else {
      await bcrypt.compare(plainPassword, DUMMY_HASH);
    }

    if (!isMatch || !user || !user.isActive) {
      return { success: false, error: "Invalid username or password" };
    }

    // Check role authorization only AFTER password is confirmed
    const allowedRoles = allowedRolesForSite(getSite());
    if (!allowedRoles.includes(user.role)) {
      return {
        success: false,
        error: "This account can't sign in on this site.",
      };
    }

    // 4. Successful login: clear rate limit counter
    await clearFailedAttempts(rateLimitKey);

    // 5. Issue session cookie
    await setStaffSessionCookie(user.id, user.sessionVersion);

    return {
      success: true,
      session: {
        userId: user.id,
        username: user.username,
        role: user.role,
        restaurantId: user.restaurantId,
        restaurantName: user.restaurant.name,
        isDemo: user.isDemo ?? false,
      },
    };
  } catch (err) {
    console.error("Database error during staff authentication:", err);
    return { success: false, error: "Service temporarily unavailable" };
  }
}
