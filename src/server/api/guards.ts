import { eq, and } from "drizzle-orm";
import { getStaffSession, type StaffSession } from "@/server/auth";
import { db } from "@/server/db";
import { tables, restaurants, type StaffRole } from "@/server/db/schema";
import { tokenParamSchema } from "@/lib/validations/guest";
import { env } from "@/server/env";
import type { ErrorCode } from "@/server/services/result";

export interface GuardError {
  code: ErrorCode;
  message: string;
  status: number;
}

export type TableWithRestaurant = typeof tables.$inferSelect & {
  restaurant: typeof restaurants.$inferSelect;
};

/**
 * Validates Origin header for cookie-authenticated write requests.
 * Origin must match host (or x-forwarded-host) or an entry in ALLOWED_ORIGINS / NEXT_PUBLIC_APP_URL.
 */
export function validateOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    return false;
  }

  let originHost: string;
  try {
    const originUrl = new URL(origin);
    originHost = originUrl.host.toLowerCase();
  } catch {
    return false;
  }

  // 1. Check against Host or X-Forwarded-Host
  const hostHeader = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (hostHeader) {
    const primaryHost = hostHeader.split(",")[0].trim().toLowerCase();
    if (originHost === primaryHost) {
      return true;
    }
  }

  // 2. Check against NEXT_PUBLIC_APP_URL
  if (env.NEXT_PUBLIC_APP_URL) {
    try {
      const appUrl = new URL(env.NEXT_PUBLIC_APP_URL);
      if (originHost === appUrl.host.toLowerCase()) {
        return true;
      }
    } catch {}
  }

  // 3. Check against ALLOWED_ORIGINS (comma-separated)
  const allowedOriginsRaw =
    process.env.ALLOWED_ORIGINS ||
    (env as unknown as Record<string, string | undefined>).ALLOWED_ORIGINS;
  if (allowedOriginsRaw) {
    const allowed = allowedOriginsRaw
      .split(",")
      .map((item: string) => item.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowed.includes(origin.toLowerCase()) ||
      allowed.includes(originHost)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Guards staff endpoints. Reads existing staff session cookie.
 */
export async function requireStaff(
  roles?: StaffRole[]
): Promise<
  | { ok: true; actor: StaffSession }
  | { ok: false; error: GuardError }
> {
  const session = await getStaffSession();
  if (!session) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "Unauthorized: Staff authentication required",
        status: 401,
      },
    };
  }

  if (roles && roles.length > 0 && !roles.includes(session.role)) {
    return {
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: `Forbidden: Access requires ${roles.join(" or ")} role`,
        status: 403,
      },
    };
  }

  return { ok: true, actor: session };
}

/**
 * Guards customer endpoints by resolving table from token.
 * Reads token from x-table-token header or param.
 */
export async function requireTableToken(
  req: Request,
  paramToken?: string
): Promise<
  | { ok: true; table: TableWithRestaurant; token: string }
  | { ok: false; error: GuardError }
> {
  const token =
    paramToken?.trim() ||
    req.headers.get("x-table-token")?.trim();

  if (!token) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Table token required in x-table-token header or path",
        status: 400,
      },
    };
  }

  const parsed = tokenParamSchema.safeParse(token);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: "Invalid table token format",
        status: 400,
      },
    };
  }

  try {
    const table = await db.query.tables.findFirst({
      where: and(eq(tables.qrToken, parsed.data), eq(tables.isActive, true)),
      with: { restaurant: true },
    });

    if (!table) {
      return {
        ok: false,
        error: {
          code: "NOT_FOUND",
          message: "Table not found or inactive",
          status: 404,
        },
      };
    }

    return { ok: true, table: table as TableWithRestaurant, token: parsed.data };
  } catch (err) {
    console.error("Database error resolving table token:", err);
    return {
      ok: false,
      error: {
        code: "INTERNAL",
        message: "Service temporarily unavailable",
        status: 500,
      },
    };
  }
}

/**
 * Extracts client IP from incoming request.
 * Only trusts x-forwarded-for and x-real-ip when running on Vercel (process.env.VERCEL),
 * otherwise returns "127.0.0.1" to prevent IP spoofing in self-hosted environments.
 */
export function getClientIpFromRequest(req: Request): string {
  if (process.env.VERCEL) {
    const forwardedFor = req.headers.get("x-forwarded-for");
    if (forwardedFor) {
      return forwardedFor.split(",")[0].trim();
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
      return realIp.trim();
    }
  }
  return "127.0.0.1";
}

