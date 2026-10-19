import { describe, it, expect, vi } from "vitest";
import {
  runSmokeTests,
  formatSmokeResults,
  type SmokeTestConfig,
  type FetchFunction,
} from "../scripts/smoke";

describe("smoke Script (scripts/smoke.ts)", () => {
  const config: SmokeTestConfig = {
    customerUrl: "http://localhost:3000",
    kitchenUrl: "http://localhost:3001",
    managerUrl: "http://localhost:3002",
    demo: false,
  };

  function createMockFetch(overrides: Record<string, Partial<Response>> = {}): FetchFunction {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || "GET";
      const key = `${method} ${urlStr}`;

      const isKitchen = urlStr.includes(":3001") || urlStr.includes("kitchen.");
      const isManager = urlStr.includes(":3002") || urlStr.includes("manager.");
      const isCustomer = urlStr.includes(":3000") || urlStr.includes("order.") || (!isKitchen && !isManager);

      const headers = new Headers();
      headers.set(
        "content-security-policy",
        isKitchen || isManager
          ? "default-src 'self'; frame-ancestors 'self' http://localhost:3000 https://order.dinepulse.intallo.in"
          : "default-src 'self'"
      );
      headers.set("x-content-type-options", "nosniff");

      if (urlStr.startsWith("https://")) {
        headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
      }

      if (isKitchen || isManager) {
        headers.set("x-robots-tag", "noindex, nofollow, noarchive");
      }

      // Check explicit overrides first
      if (overrides[key]) {
        const o = overrides[key];
        return new Response(o.status === 404 ? "Not Found" : (o as { body?: string }).body || JSON.stringify({ success: true }), {
          status: o.status ?? 200,
          headers: o.headers ?? headers,
        });
      }

      // Default mock responses
      if (urlStr.endsWith("/api/v1/health")) {
        return new Response(JSON.stringify({ success: true, message: "Database connection healthy" }), {
          status: 200,
          headers,
        });
      }

      if (urlStr.endsWith("/manifest.webmanifest")) {
        return new Response(JSON.stringify({ name: "DinePulse Kitchen", short_name: "Kitchen" }), {
          status: 200,
          headers,
        });
      }

      if (urlStr.endsWith("/api/v1/auth/login")) {
        const authHeaders = new Headers(headers);
        authHeaders.set("set-cookie", "dinepulse_kitchen_session=sample-cookie; Path=/; HttpOnly");
        return new Response(JSON.stringify({ success: true, data: { user: { role: "kitchen" } } }), {
          status: 200,
          headers: authHeaders,
        });
      }

      // Default 404 blocked endpoints
      if (
        (isCustomer && (urlStr.endsWith("/kitchen") || urlStr.endsWith("/admin") || urlStr.endsWith("/api/v1/admin/orders"))) ||
        (isKitchen && (urlStr.endsWith("/admin") || urlStr.endsWith("/t/x"))) ||
        (isManager && urlStr.endsWith("/kitchen"))
      ) {
        return new Response("Not Found", { status: 404, headers });
      }

      // Default root pages
      return new Response("<!DOCTYPE html><html><body>OK</body></html>", {
        status: 200,
        headers,
      });
    }) as unknown as FetchFunction;
  }

  it("passes all checks when all three sites return valid responses", async () => {
    const mockFetch = createMockFetch();
    const summary = await runSmokeTests(config, mockFetch);

    expect(summary.passed).toBe(true);
    expect(summary.results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("checks staff auth endpoints when demo is enabled", async () => {
    const mockFetch = createMockFetch();
    const summary = await runSmokeTests({ ...config, demo: true }, mockFetch);

    expect(summary.passed).toBe(true);
    const kitchenDemoCheck = summary.results.find(
      (r) => r.site === "kitchen" && r.name.includes("/api/v1/auth/login")
    );
    expect(kitchenDemoCheck).toBeDefined();
    expect(kitchenDemoCheck?.status).toBe("PASS");

    const managerDemoCheck = summary.results.find(
      (r) => r.site === "manager" && r.name.includes("/api/v1/auth/login")
    );
    expect(managerDemoCheck).toBeDefined();
    expect(managerDemoCheck?.status).toBe("PASS");
  });

  it("fails if health check returns non-200 or database error", async () => {
    const mockFetch = createMockFetch({
      "GET http://localhost:3000/api/v1/health": {
        status: 500,
        body: JSON.stringify({ success: false, error: "DB dead" }),
      } as never,
    });

    const summary = await runSmokeTests(config, mockFetch);
    expect(summary.passed).toBe(false);
    const healthResult = summary.results.find(
      (r) => r.site === "customer" && r.name === "GET /api/v1/health"
    );
    expect(healthResult?.status).toBe("FAIL");
    expect(healthResult?.message).toContain("Expected HTTP 200");
  });

  it("fails if customer route isolation is breached (e.g. /kitchen returns 200)", async () => {
    const mockFetch = createMockFetch({
      "GET http://localhost:3000/kitchen": {
        status: 200,
      },
    });

    const summary = await runSmokeTests(config, mockFetch);
    expect(summary.passed).toBe(false);
    const breachResult = summary.results.find(
      (r) => r.site === "customer" && r.name === "GET /kitchen"
    );
    expect(breachResult?.status).toBe("FAIL");
    expect(breachResult?.message).toContain("Expected 404");
  });

  it("fails if kitchen manifest has incorrect name or missing noindex header", async () => {
    const badHeaders = new Headers();
    badHeaders.set("content-security-policy", "default-src 'self'");
    badHeaders.set("x-content-type-options", "nosniff");
    // Missing x-robots-tag

    const mockFetch = createMockFetch({
      "GET http://localhost:3001/": {
        status: 200,
        headers: badHeaders,
      },
      "GET http://localhost:3001/manifest.webmanifest": {
        status: 200,
        body: JSON.stringify({ name: "Wrong Name" }),
      } as never,
    });

    const summary = await runSmokeTests(config, mockFetch);
    expect(summary.passed).toBe(false);

    const robotsCheck = summary.results.find(
      (r) => r.site === "kitchen" && r.name === "GET /"
    );
    expect(robotsCheck?.status).toBe("FAIL");
    expect(robotsCheck?.message).toContain("Expected X-Robots-Tag to contain noindex");

    const manifestCheck = summary.results.find(
      (r) => r.site === "kitchen" && r.name === "GET /manifest.webmanifest"
    );
    expect(manifestCheck?.status).toBe("FAIL");
    expect(manifestCheck?.message).toContain("DinePulse Kitchen");
  });

  it("fails if security headers (CSP or X-Content-Type-Options) are missing", async () => {
    const insecureHeaders = new Headers(); // missing CSP and nosniff

    const mockFetch = createMockFetch({
      "GET http://localhost:3000/": {
        status: 200,
        headers: insecureHeaders,
      },
    });

    const summary = await runSmokeTests(config, mockFetch);
    expect(summary.passed).toBe(false);
    const secCheck = summary.results.find(
      (r) => r.site === "customer" && r.name.includes("Security Headers")
    );
    expect(secCheck?.status).toBe("FAIL");
  });

  it("verifies HSTS on HTTPS origins", async () => {
    const httpsConfig: SmokeTestConfig = {
      customerUrl: "https://order.dinepulse.intallo.in",
      kitchenUrl: "https://kitchen.dinepulse.intallo.in",
      managerUrl: "https://manager.dinepulse.intallo.in",
    };

    const mockFetch = createMockFetch();
    const summary = await runSmokeTests(httpsConfig, mockFetch);
    expect(summary.passed).toBe(true);

    const secCheck = summary.results.find(
      (r) => r.site === "customer" && r.name.includes("Security Headers")
    );
    expect(secCheck?.message).toContain("HSTS active");
  });

  it("handles fetch network rejections gracefully", async () => {
    const failingFetch: FetchFunction = vi.fn(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:3000");
    }) as unknown as FetchFunction;

    const summary = await runSmokeTests(config, failingFetch);
    expect(summary.passed).toBe(false);
    expect(summary.results[0].status).toBe("FAIL");
    expect(summary.results[0].message).toContain("ECONNREFUSED");
  });

  it("fails if frame-ancestors is missing on kitchen or manager during demo mode", async () => {
    const missingFrameAncestorsHeaders = new Headers();
    missingFrameAncestorsHeaders.set("content-security-policy", "default-src 'self'"); // no frame-ancestors
    missingFrameAncestorsHeaders.set("x-content-type-options", "nosniff");

    const mockFetch = createMockFetch({
      "GET http://localhost:3001/": {
        status: 200,
        headers: missingFrameAncestorsHeaders,
      },
    });

    const summary = await runSmokeTests({ ...config, demo: true }, mockFetch);
    expect(summary.passed).toBe(false);
    const kitchenSecCheck = summary.results.find(
      (r) => r.site === "kitchen" && r.name.includes("Security Headers")
    );
    expect(kitchenSecCheck?.status).toBe("FAIL");
    expect(kitchenSecCheck?.message).toContain("Expected CSP frame-ancestors to include customer origin");
  });

  it("fails if login returns 200 but lacks set-cookie header", async () => {
    const noCookieHeaders = new Headers();
    noCookieHeaders.set("content-security-policy", "default-src 'self'");
    noCookieHeaders.set("x-content-type-options", "nosniff");

    const mockFetch = createMockFetch({
      "POST http://localhost:3001/api/v1/auth/login": {
        status: 200,
        headers: noCookieHeaders, // missing set-cookie
      },
    });

    const summary = await runSmokeTests({ ...config, demo: true }, mockFetch);
    expect(summary.passed).toBe(false);
    const loginCheck = summary.results.find(
      (r) => r.site === "kitchen" && r.name.includes("/api/v1/auth/login")
    );
    expect(loginCheck?.status).toBe("FAIL");
    expect(loginCheck?.message).toContain("missing set-cookie");
  });

  it("formats readable summary table", () => {
    const summary = {
      passed: true,
      results: [
        {
          site: "customer" as const,
          name: "GET /api/v1/health",
          status: "PASS" as const,
          message: "HTTP 200 OK",
        },
      ],
    };
    const output = formatSmokeResults(summary);
    expect(output).toContain("DinePulse Production Smoke Tests");
    expect(output).toContain("PASSED");
  });
});
