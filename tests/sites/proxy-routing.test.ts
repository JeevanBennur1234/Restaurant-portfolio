import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, routeDecisionForSite } from "@/proxy";

describe("Multi-Site Proxy Routing", () => {
  const originalSite = process.env.SITE;

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.SITE;
    } else {
      process.env.SITE = originalSite;
    }
  });

  describe("Customer Site (SITE=customer)", () => {
    beforeEach(() => {
      process.env.SITE = "customer";
    });

    it("allows customer routes and public endpoints without rewriting", () => {
      const allowedPaths = [
        "/",
        "/demo",
        "/demo/view",
        "/t/demo-table-7",
        "/t/demo-table-7/order/ord_123",
        "/api/v1/customer/tables/demo-table-7/menu",
        "/api/v1/openapi.json",
        "/api/webhooks/razorpay",
        "/api/demo/reset",
        "/api/v1/health",
        "/favicon.ico",
        "/robots.txt",
        "/sitemap.xml",
        "/media/hero.mp4",
        "/images/food.jpg",
      ];

      for (const path of allowedPaths) {
        const decision = routeDecisionForSite("customer", path);
        expect(decision.allowed, `Expected ${path} to be allowed on customer site`).toBe(true);
        expect(decision.rewriteTo).toBeUndefined();

        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = proxy(req);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      }
    });

    it("blocks kitchen, admin, and staff auth routes with 404 rewrite", () => {
      const blockedPaths = [
        "/kitchen",
        "/kitchen/orders",
        "/admin",
        "/admin/reports",
        "/api/v1/kitchen/tickets",
        "/api/v1/admin/orders",
        "/api/v1/auth/login",
      ];

      for (const path of blockedPaths) {
        const decision = routeDecisionForSite("customer", path);
        expect(decision.allowed, `Expected ${path} to be blocked on customer site`).toBe(false);

        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = proxy(req);
        const rewrite = res.headers.get("x-middleware-rewrite");
        expect(rewrite).not.toBeNull();
        expect(rewrite).toContain("/_not-found");
      }
    });
  });

  describe("Kitchen Site (SITE=kitchen)", () => {
    beforeEach(() => {
      process.env.SITE = "kitchen";
    });

    it("rewrites root path '/' to '/kitchen'", () => {
      const decision = routeDecisionForSite("kitchen", "/");
      expect(decision.allowed).toBe(true);
      expect(decision.rewriteTo).toBe("/kitchen");

      const req = new NextRequest("http://localhost:3001/");
      const res = proxy(req);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      expect(rewrite).toContain("/kitchen");
    });

    it("allows kitchen-specific paths and staff auth without rewriting", () => {
      const allowedPaths = [
        "/kitchen",
        "/kitchen/live",
        "/api/v1/kitchen/tickets",
        "/api/v1/kitchen/orders/123/transition",
        "/api/v1/auth/login",
        "/api/v1/auth/logout",
        "/api/v1/auth/me",
        "/api/v1/health",
      ];

      for (const path of allowedPaths) {
        const decision = routeDecisionForSite("kitchen", path);
        expect(decision.allowed, `Expected ${path} to be allowed on kitchen site`).toBe(true);
        expect(decision.rewriteTo).toBeUndefined();

        const req = new NextRequest(`http://localhost:3001${path}`);
        const res = proxy(req);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      }
    });

    it("blocks customer and admin surfaces with 404 rewrite", () => {
      const blockedPaths = [
        "/admin",
        "/admin/items",
        "/demo",
        "/t/demo-table-7",
        "/api/v1/customer/tables/foo/menu",
        "/api/v1/admin/orders",
      ];

      for (const path of blockedPaths) {
        const decision = routeDecisionForSite("kitchen", path);
        expect(decision.allowed, `Expected ${path} to be blocked on kitchen site`).toBe(false);

        const req = new NextRequest(`http://localhost:3001${path}`);
        const res = proxy(req);
        const rewrite = res.headers.get("x-middleware-rewrite");
        expect(rewrite).not.toBeNull();
        expect(rewrite).toContain("/_not-found");
      }
    });
  });

  describe("Manager Site (SITE=manager)", () => {
    beforeEach(() => {
      process.env.SITE = "manager";
    });

    it("rewrites root path '/' to '/admin'", () => {
      const decision = routeDecisionForSite("manager", "/");
      expect(decision.allowed).toBe(true);
      expect(decision.rewriteTo).toBe("/admin");

      const req = new NextRequest("http://localhost:3002/");
      const res = proxy(req);
      const rewrite = res.headers.get("x-middleware-rewrite");
      expect(rewrite).not.toBeNull();
      expect(rewrite).toContain("/admin");
    });

    it("allows admin dashboard routes, admin APIs, and staff auth", () => {
      const allowedPaths = [
        "/admin",
        "/admin/tables",
        "/admin/menu",
        "/api/v1/admin/orders",
        "/api/v1/admin/categories",
        "/api/v1/admin/tables/qr.pdf",
        "/api/admin/tables/qr-pdf",
        "/api/admin/upload",
        "/api/v1/auth/login",
        "/api/v1/health",
      ];

      for (const path of allowedPaths) {
        const decision = routeDecisionForSite("manager", path);
        expect(decision.allowed, `Expected ${path} to be allowed on manager site`).toBe(true);
        expect(decision.rewriteTo).toBeUndefined();

        const req = new NextRequest(`http://localhost:3002${path}`);
        const res = proxy(req);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      }
    });

    it("blocks kitchen and customer surfaces with 404 rewrite", () => {
      const blockedPaths = [
        "/kitchen",
        "/kitchen/orders",
        "/demo",
        "/t/demo-table-7",
        "/api/v1/customer/tables/foo/orders",
        "/api/v1/kitchen/tickets",
      ];

      for (const path of blockedPaths) {
        const decision = routeDecisionForSite("manager", path);
        expect(decision.allowed, `Expected ${path} to be blocked on manager site`).toBe(false);

        const req = new NextRequest(`http://localhost:3002${path}`);
        const res = proxy(req);
        const rewrite = res.headers.get("x-middleware-rewrite");
        expect(rewrite).not.toBeNull();
        expect(rewrite).toContain("/_not-found");
      }
    });
  });

  describe("Unified Site (SITE=all)", () => {
    beforeEach(() => {
      process.env.SITE = "all";
    });

    it("allows all paths across customer, kitchen, and manager", () => {
      const allPaths = [
        "/",
        "/kitchen",
        "/admin",
        "/demo",
        "/t/demo-table-7",
        "/api/v1/customer/tables/demo-table-7/menu",
        "/api/v1/kitchen/tickets",
        "/api/v1/admin/orders",
        "/api/v1/auth/login",
        "/api/v1/health",
      ];

      for (const path of allPaths) {
        const decision = routeDecisionForSite("all", path);
        expect(decision.allowed).toBe(true);

        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = proxy(req);
        expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      }
    });
  });
});
