import { describe, it, expect } from "vitest";
import { apiOk, apiError, fromServiceResult } from "@/server/api/envelope";
import { ok, fail } from "@/server/services/result";

describe("API Envelope Helper", () => {
  it("apiOk formats success response with Cache-Control no-store", async () => {
    const res = apiOk({ test: 123 }, 200);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { test: 123 },
    });
  });

  it("apiError formats error response with error code and message", async () => {
    const res = apiError("NOT_FOUND", "Item was not found", 404);
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Item was not found",
      },
    });
  });

  it("fromServiceResult converts successful ServiceResult", async () => {
    const serviceRes = ok({ orderId: "ord-1" });
    const res = fromServiceResult(serviceRes, 201);
    expect(res.status).toBe(201);

    const json = await res.json();
    expect(json).toEqual({
      success: true,
      data: { orderId: "ord-1" },
    });
  });

  it("fromServiceResult converts failure ServiceResult", async () => {
    const serviceRes = fail("FORBIDDEN", "No access", 403);
    const res = fromServiceResult(serviceRes);
    expect(res.status).toBe(403);

    const json = await res.json();
    expect(json).toEqual({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "No access",
      },
    });
  });
});
