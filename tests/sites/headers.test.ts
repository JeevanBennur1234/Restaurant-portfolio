import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { validateFrameAncestors } from "@/server/env";
import { proxy } from "@/proxy";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("Multi-Site Security Headers & SEO Policies", () => {
  const originalSite = process.env.SITE;
  const originalFrameAncestors = process.env.FRAME_ANCESTORS;

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.SITE;
    } else {
      process.env.SITE = originalSite;
    }

    if (originalFrameAncestors === undefined) {
      delete process.env.FRAME_ANCESTORS;
    } else {
      process.env.FRAME_ANCESTORS = originalFrameAncestors;
    }
  });

  describe("FRAME_ANCESTORS Validation & Parsing", () => {
    it("accepts valid https origins", () => {
      const single = validateFrameAncestors("https://example.com", true);
      expect(single.valid).toBe(true);
      expect(single.origins).toEqual(["https://example.com"]);

      const multi = validateFrameAncestors("https://example.com, https://partner.org", false);
      expect(multi.valid).toBe(true);
      expect(multi.origins).toEqual(["https://example.com", "https://partner.org"]);
    });

    it("accepts http localhost and 127.0.0.1 outside production", () => {
      const localhost = validateFrameAncestors("http://localhost:3000", false);
      expect(localhost.valid).toBe(true);
      expect(localhost.origins).toEqual(["http://localhost:3000"]);

      const loopback = validateFrameAncestors("http://127.0.0.1:8080", false);
      expect(loopback.valid).toBe(true);
      expect(loopback.origins).toEqual(["http://127.0.0.1:8080"]);
    });

    it("rejects wildcards (*)", () => {
      const wildcard = validateFrameAncestors("*", false);
      expect(wildcard.valid).toBe(false);
      expect(wildcard.error).toContain("Wildcards");

      const subdomainWildcard = validateFrameAncestors("https://*.example.com", false);
      expect(subdomainWildcard.valid).toBe(false);
      expect(subdomainWildcard.error).toContain("Wildcards");
    });

    it("rejects paths in origins", () => {
      const withPath = validateFrameAncestors("https://example.com/embed", false);
      expect(withPath.valid).toBe(false);
      expect(withPath.error).toContain("Paths are not allowed");

      const withTrailingSlash = validateFrameAncestors("https://example.com/", false);
      expect(withTrailingSlash.valid).toBe(false);
      expect(withTrailingSlash.error).toContain("Paths are not allowed");
    });

    it("rejects http in production", () => {
      const httpProd = validateFrameAncestors("http://localhost:3000", true);
      expect(httpProd.valid).toBe(false);
      expect(httpProd.error).toContain("http:// origins are not allowed in production");

      const remoteHttpProd = validateFrameAncestors("http://example.com", true);
      expect(remoteHttpProd.valid).toBe(false);
    });

    it("rejects non-localhost http outside production", () => {
      const remoteHttpDev = validateFrameAncestors("http://insecure-site.com", false);
      expect(remoteHttpDev.valid).toBe(false);
      expect(remoteHttpDev.error).toContain("must be localhost or 127.0.0.1");
    });
  });

  describe("X-Frame-Options and CSP Frame-Ancestors Behavior", () => {
    it("drops X-Frame-Options and injects origins into CSP when FRAME_ANCESTORS is set", () => {
      process.env.FRAME_ANCESTORS = "http://localhost:3000";
      const req = new NextRequest("http://localhost:3000/api/v1/health");
      const res = proxy(req);

      // X-Frame-Options must NOT be set
      expect(res.headers.get("X-Frame-Options")).toBeNull();

      // CSP frame-ancestors must include the origin
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).not.toBeNull();
      expect(csp).toContain("frame-ancestors 'self' http://localhost:3000");
    });

    it("retains X-Frame-Options: SAMEORIGIN when FRAME_ANCESTORS is unset", () => {
      delete process.env.FRAME_ANCESTORS;
      const req = new NextRequest("http://localhost:3000/api/v1/health");
      const res = proxy(req);

      expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      const csp = res.headers.get("Content-Security-Policy") || "";
      const frameAncestorsDirective = csp
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("frame-ancestors"));
      expect(frameAncestorsDirective).toBe("frame-ancestors 'self'");
    });
  });

  describe("X-Robots-Tag Header per Site", () => {
    it("sets X-Robots-Tag: noindex, nofollow, noarchive on kitchen and manager sites", () => {
      process.env.SITE = "kitchen";
      const kitchenReq = new NextRequest("http://localhost:3001/kitchen");
      const kitchenRes = proxy(kitchenReq);
      expect(kitchenRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");

      process.env.SITE = "manager";
      const managerReq = new NextRequest("http://localhost:3002/admin");
      const managerRes = proxy(managerReq);
      expect(managerRes.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    });

    it("does NOT set X-Robots-Tag on customer and all sites", () => {
      process.env.SITE = "customer";
      const customerReq = new NextRequest("http://localhost:3000/");
      const customerRes = proxy(customerReq);
      expect(customerRes.headers.get("X-Robots-Tag")).toBeNull();

      process.env.SITE = "all";
      const allReq = new NextRequest("http://localhost:3000/");
      const allRes = proxy(allReq);
      expect(allRes.headers.get("X-Robots-Tag")).toBeNull();
    });
  });

  describe("robots.ts & sitemap.ts per Site", () => {
    it("disallows all crawling and omits sitemap on kitchen and manager sites", () => {
      process.env.SITE = "kitchen";
      const kitchenRobots = robots();
      expect(kitchenRobots.sitemap).toBeUndefined();
      expect(kitchenRobots.rules).toEqual({
        userAgent: "*",
        disallow: ["/"],
      });
      expect(sitemap()).toEqual([]);

      process.env.SITE = "manager";
      const managerRobots = robots();
      expect(managerRobots.sitemap).toBeUndefined();
      expect(managerRobots.rules).toEqual({
        userAgent: "*",
        disallow: ["/"],
      });
      expect(sitemap()).toEqual([]);
    });

    it("returns normal crawl rules and sitemap on customer and all sites", () => {
      process.env.SITE = "customer";
      const customerRobots = robots();
      expect(customerRobots.sitemap).toBeDefined();
      expect((customerRobots.rules as { allow: string[] }).allow).toEqual(["/", "/demo"]);
      expect(sitemap().length).toBeGreaterThan(0);

      process.env.SITE = "all";
      const allRobots = robots();
      expect(allRobots.sitemap).toBeDefined();
      expect((allRobots.rules as { allow: string[] }).allow).toEqual(["/", "/demo"]);
      expect(sitemap().length).toBeGreaterThan(0);
    });
  });
});
