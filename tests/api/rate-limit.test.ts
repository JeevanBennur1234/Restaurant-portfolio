import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import * as rateLimitModule from "@/server/rate-limit";
import { NextRequest } from "next/server";

vi.mock("@/server/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

describe("API Handler Rate Limiting & Validation", () => {
  it("returns 429 RATE_LIMITED with Retry-After header when rate limit is exceeded", async () => {
    vi.mocked(rateLimitModule.checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      count: 121,
      remaining: 0,
      retryAfterSeconds: 45,
    });

    const handler = withApi(
      async () => {
        return new Response("ok");
      },
      {
        rateLimit: "customer",
      }
    );

    const req = new NextRequest("http://localhost:3000/api/v1/customer/tables/t1/menu");
    const res = await handler(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");

    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("RATE_LIMITED");
  });

  it("returns 400 VALIDATION when request body fails validation schema", async () => {
    const handler = withApi(
      async () => {
        return new Response("ok");
      },
      {
        bodySchema: z.object({
          requiredField: z.string().min(3),
        }),
      }
    );

    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requiredField: "ab" }), // less than 3 chars
    });

    const res = await handler(req);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION");
  });

  it("returns 400 VALIDATION when JSON is malformed", async () => {
    const handler = withApi(
      async () => {
        return new Response("ok");
      },
      {
        bodySchema: z.object({ foo: z.string() }),
      }
    );

    const req = new NextRequest("http://localhost:3000/api/v1/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid-json{",
    });

    const res = await handler(req);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { success: boolean; error: { code: string; message: string } };
    expect(json.success).toBe(false);
    expect(json.error.code).toBe("VALIDATION");
    expect(json.error.message).toContain("JSON");
  });
});
