import { z } from "zod";
import { authenticateStaff } from "@/server/auth";
import { withApi } from "@/server/api/handler";
import { apiOk, apiError } from "@/server/api/envelope";


const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const POST = withApi(
  async ({ req, body }) => {
    const forwarded = req.headers.get("x-forwarded-for");
    const clientIp =
      (forwarded
        ? forwarded.split(",")[0].trim()
        : req.headers.get("x-real-ip")) || "127.0.0.1";

    const authResult = await authenticateStaff(
      body.username,
      body.password,
      clientIp
    );

    if (!authResult.success) {
      if (
        authResult.error &&
        authResult.error.toLowerCase().includes("too many failed")
      ) {
        return apiError(
          "RATE_LIMITED",
          authResult.error,
          429,
          { "Retry-After": "900" }
        );
      }

      return apiError(
        "UNAUTHENTICATED",
        authResult.error ?? "Invalid username or password",
        401
      );
    }

    return apiOk({ user: authResult.session });
  },
  {
    bodySchema: loginSchema,
  }
);
