import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { resetDemoData } from "@/server/services/demo";

function isTokenValid(token: string, secret?: string): boolean {
  if (!secret) return false;
  const tokenBuf = Buffer.from(token);
  const secretBuf = Buffer.from(secret);
  if (tokenBuf.length !== secretBuf.length) return false;
  return crypto.timingSafeEqual(tokenBuf, secretBuf);
}

export async function handler(request: NextRequest) {
  // 1. Forbidden unless DEMO_MODE === "true"
  if (env.DEMO_MODE !== "true") {
    return NextResponse.json(
      { success: false, error: "Demo reset is disabled when DEMO_MODE is false" },
      { status: 403 }
    );
  }

  // 2. Authorization check with DEMO_RESET_SECRET or CRON_SECRET
  if (!env.DEMO_RESET_SECRET && !env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, error: "Neither DEMO_RESET_SECRET nor CRON_SECRET is configured on server" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Missing Bearer token" },
      { status: 401 }
    );
  }

  const providedToken = authHeader.slice(7).trim();
  const isValid =
    isTokenValid(providedToken, env.DEMO_RESET_SECRET) ||
    isTokenValid(providedToken, env.CRON_SECRET);

  if (!isValid) {
    return NextResponse.json(
      { success: false, error: "Unauthorized: Invalid secret" },
      { status: 401 }
    );
  }

  // 3. Reset demo orders and re-seed clean demo state via demo service
  const result = await resetDemoData({ db });
  if (result.ok) {
    return NextResponse.json({
      success: true,
      message: result.data.message,
    });
  }

  return NextResponse.json(
    { success: false, error: result.message },
    { status: result.status }
  );
}

export const GET = handler;
export const POST = handler;
