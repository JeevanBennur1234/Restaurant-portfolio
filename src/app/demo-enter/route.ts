import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { staffUsers } from "@/server/db/schema";
import { setStaffSessionCookie } from "@/server/auth";
import { env } from "@/server/env";
import { getSite } from "@/server/site";
import { getClientIpFromRequest } from "@/server/api/guards";
import { checkRateLimit } from "@/server/rate-limit";

export async function GET(req: NextRequest) {
  if (env.DEMO_MODE !== "true") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const site = getSite();
  // Strictly disallow on customer site
  if (site === "customer") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const clientIp = getClientIpFromRequest(req);
  const rateCheck = await checkRateLimit({
    key: `demo-login:${clientIp}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });

  if (!rateCheck.allowed) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: {
        "Retry-After": String(rateCheck.retryAfterSeconds ?? 600),
        "Content-Type": "text/plain",
      },
    });
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

  const redirectPath =
    site === "all"
      ? targetRole === "kitchen"
        ? "/kitchen"
        : "/admin"
      : "/";
  const redirectUrl = new URL(redirectPath, req.url);
  const response = NextResponse.redirect(redirectUrl, 303);

  await setStaffSessionCookie(demoUser.id, demoUser.sessionVersion, response);

  return response;
}
