import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { staffUsers } from "@/server/db/schema";
import { setStaffSessionCookie } from "@/server/auth";
import { env } from "@/server/env";
import { withApi } from "@/server/api/handler";
import { apiOk, apiError } from "@/server/api/envelope";
import { allowedRolesForSite } from "@/server/site";
import { validateOrigin } from "@/server/api/guards";

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

    const origin = req.headers.get("origin");
    if (origin && !validateOrigin(req)) {
      return apiError(
        "FORBIDDEN",
        "Forbidden: Invalid origin",
        403
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
