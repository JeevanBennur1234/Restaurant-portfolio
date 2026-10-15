import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { staffUsers } from "@/server/db/schema";
import { signSessionPayload, type SessionPayload } from "@/server/auth";
import { env } from "@/server/env";
import { getSite, sessionCookieNameForSite } from "@/server/site";

export async function GET(req: NextRequest) {
  if (env.DEMO_MODE !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const site = getSite();
  // Strictly disallow on customer site
  if (site === "customer") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const roleParam = req.nextUrl.searchParams.get("role");
  let targetRole: "kitchen" | "manager" =
    site === "kitchen" ? "kitchen" : "manager";

  if (site === "all") {
    if (roleParam === "kitchen") {
      targetRole = "kitchen";
    } else {
      targetRole = "manager";
    }
  }

  const demoUser = await db.query.staffUsers.findFirst({
    where: and(
      eq(staffUsers.role, targetRole),
      eq(staffUsers.isActive, true),
      eq(staffUsers.isDemo, true)
    ),
  });

  if (!demoUser) {
    return new NextResponse(`Demo user for role '${targetRole}' not found`, {
      status: 404,
    });
  }

  const redirectPath = targetRole === "kitchen" ? "/kitchen" : "/admin";
  const redirectUrl = new URL(redirectPath, req.url);
  const response = NextResponse.redirect(redirectUrl, 303);

  const now = Math.floor(Date.now() / 1000);
  const currentSite = site;
  const payload: SessionPayload = {
    userId: demoUser.id,
    sessionVersion: demoUser.sessionVersion,
    iat: now,
    exp: now + 12 * 60 * 60, // 12 hours
    aud: currentSite,
  };
  const token = signSessionPayload(payload);
  const cookieName = sessionCookieNameForSite(currentSite);

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  return response;
}
