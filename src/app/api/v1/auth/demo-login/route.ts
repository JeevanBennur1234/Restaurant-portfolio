import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { staffUsers } from "@/server/db/schema";
import { setStaffSessionCookie } from "@/server/auth";
import { env } from "@/server/env";
import { withApi } from "@/server/api/handler";
import { apiOk, apiError } from "@/server/api/envelope";
import { allowedRolesForSite } from "@/server/site";
import { validateOrigin, getClientIpFromRequest } from "@/server/api/guards";
import { checkRateLimit } from "@/server/rate-limit";

const demoLoginSchema = z.object({
  role: z.enum(["kitchen", "manager"], {
    message: "Invalid demo role",
  }),
});

export const POST = withApi(
  async ({ req, body }) => {
    if (env.DEMO_MODE !== "true") {
      return apiError(
        "NOT_FOUND",
        "Not Found",
        404
      );
    }

    if (!validateOrigin(req)) {
      return apiError(
        "FORBIDDEN",
        "Forbidden: Invalid origin",
        403
      );
    }

    const clientIp = getClientIpFromRequest(req);
    const rateCheck = await checkRateLimit({
      key: `demo-login:${clientIp}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });

    if (!rateCheck.allowed) {
      return apiError(
        "RATE_LIMITED",
        "Too many demo login requests",
        429,
        {
          "Retry-After": String(rateCheck.retryAfterSeconds ?? 600),
        }
      );
    }

    const allowedRoles = allowedRolesForSite();
    if (!allowedRoles.includes(body.role)) {
      return apiError(
        "FORBIDDEN",
        "This account can't sign in on this site.",
        403
      );
    }

    try {
      const demoUser = await db.query.staffUsers.findFirst({
        where: and(
          eq(staffUsers.role, body.role),
          eq(staffUsers.isActive, true),
          eq(staffUsers.isDemo, true)
        ),
      });

      if (!demoUser) {
        return apiError(
          "NOT_FOUND",
          `Demo user for role '${body.role}' not found in database.`,
          404
        );
      }

      await setStaffSessionCookie(demoUser.id, demoUser.sessionVersion);

      return apiOk({
        success: true,
        redirectTo: body.role === "kitchen" ? "/kitchen" : "/admin",
      });
    } catch (err) {
      console.error("Database error in demo-login route:", err);
      return apiError(
        "INTERNAL",
        "Service temporarily unavailable",
        500
      );
    }
  },
  {
    bodySchema: demoLoginSchema,
  }
);
