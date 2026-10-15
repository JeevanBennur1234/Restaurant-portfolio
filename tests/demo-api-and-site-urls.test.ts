import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as handleDemoLogin } from "@/app/api/v1/auth/demo-login/route";
import { POST as handleOrderStep } from "@/app/api/v1/customer/orders/[id]/step/route";
import { GET as handleDemoEnter } from "@/app/demo-enter/route";
import { getSiteUrls, resolveSiteUrl, validateSiteUrlOrigin } from "@/lib/site-urls";
import manifest from "@/app/manifest";

// Mock environment
vi.mock("@/server/env", () => ({
  env: {
    NODE_ENV: "test",
    DEMO_MODE: "true",
    DATABASE_URL: "postgres://mock",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-32-chars-long-123456",
  },
}));

vi.mock("@/server/auth", () => ({
  setStaffSessionCookie: vi.fn(async () => undefined),
  getStaffSession: vi.fn(async () => null),
  signSessionPayload: vi.fn(() => "mock-jwt-token"),
}));

vi.mock("@/server/realtime", () => ({
  publishRealtimeEvent: vi.fn().mockResolvedValue(undefined),
  getRestaurantChannel: vi.fn((id: string) => `restaurant:${id}`),
}));

// Mock DB
const mockDemoKitchenUser = {
  id: "usr_demo_kitchen",
  role: "kitchen",
  username: "kitchen",
  isActive: true,
  isDemo: true,
  sessionVersion: 1,
};

const mockDemoManagerUser = {
  id: "usr_demo_manager",
  role: "manager",
  username: "manager",
  isActive: true,
  isDemo: true,
  sessionVersion: 1,
};

vi.mock("@/server/db", () => ({
  db: {
    query: {
      staffUsers: {
        findFirst: vi.fn(async () => mockDemoKitchenUser),
      },
      tables: {
        findFirst: vi.fn(async () => ({
          id: "tbl_1",
          tableNumber: "Table 7",
          qrToken: "tok_table_7",
          isActive: true,
          restaurantId: "rest_1",
          restaurant: { id: "rest_1", name: "Masala Lane" },
        })),
      },
      orders: {
        findFirst: vi.fn(async () => ({
          id: "ord_101",
          status: "placed",
          restaurantId: "rest_1",
          table: {
            qrToken: "tok_table_7",
          },
        })),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ count: 1 }]),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
      const txMock = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(undefined),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn().mockResolvedValue(undefined),
        })),
      };
      return cb(txMock);
    }),
  },
}));

import { env } from "@/server/env";
import { db } from "@/server/db";
import { setStaffSessionCookie } from "@/server/auth";

describe("Demo Login API (POST /api/v1/auth/demo-login)", () => {
  const originalSite = process.env.SITE;

  beforeEach(() => {
    vi.clearAllMocks();
    (env as { DEMO_MODE: string }).DEMO_MODE = "true";
    process.env.SITE = "kitchen";
  });

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.SITE;
    } else {
      process.env.SITE = originalSite;
    }
  });

  it("rejects demo login when DEMO_MODE is not true", async () => {
    (env as { DEMO_MODE: string }).DEMO_MODE = "false";
    const req = new NextRequest("http://localhost:3001/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "kitchen" }),
    });

    const res = await handleDemoLogin(req);
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toMatch(/not found/i);
  });

  it("rejects demo login when role is not allowed on site", async () => {
    process.env.SITE = "manager";
    const req = new NextRequest("http://localhost:3002/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "kitchen" }),
    });

    const res = await handleDemoLogin(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error.message).toMatch(/This account can't sign in on this site/i);
  });

  it("successfully signs in demo kitchen user and sets session cookie", async () => {
    process.env.SITE = "kitchen";
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockDemoKitchenUser as never);

    const req = new NextRequest("http://localhost:3001/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "kitchen" }),
    });

    const res = await handleDemoLogin(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.success).toBe(true);
    expect(json.data.redirectTo).toBe("/kitchen");
    expect(setStaffSessionCookie).toHaveBeenCalledWith(
      mockDemoKitchenUser.id,
      mockDemoKitchenUser.sessionVersion
    );
  });

  it("successfully signs in demo manager user on manager site", async () => {
    process.env.SITE = "manager";
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockDemoManagerUser as never);

    const req = new NextRequest("http://localhost:3002/api/v1/auth/demo-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "manager" }),
    });

    const res = await handleDemoLogin(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.success).toBe(true);
    expect(json.data.redirectTo).toBe("/admin");
    expect(setStaffSessionCookie).toHaveBeenCalledWith(
      mockDemoManagerUser.id,
      mockDemoManagerUser.sessionVersion
    );
  });
});

describe("Customer Order Step API (POST /api/v1/customer/orders/[id]/step)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (env as { DEMO_MODE: string }).DEMO_MODE = "true";
  });

  it("returns 404 when DEMO_MODE is false", async () => {
    (env as { DEMO_MODE: string }).DEMO_MODE = "false";
    const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/ord_101/step", {
      method: "POST",
      headers: { "x-table-token": "tok_table_7" },
    });

    const res = await handleOrderStep(req, { params: Promise.resolve({ id: "ord_101" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 when table token is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/ord_101/step", {
      method: "POST",
    });

    const res = await handleOrderStep(req, { params: Promise.resolve({ id: "ord_101" }) });
    expect(res.status).toBe(400);
  });

  it("advances order to preparing and returns newStatus", async () => {
    const req = new NextRequest("http://localhost:3000/api/v1/customer/orders/ord_101/step", {
      method: "POST",
      headers: { "x-table-token": "tok_table_7" },
    });

    const res = await handleOrderStep(req, { params: Promise.resolve({ id: "ord_101" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.newStatus).toBe("preparing");
  });
});

describe("Demo Enter Route (GET /demo-enter)", () => {
  const originalSite = process.env.SITE;

  beforeEach(() => {
    vi.clearAllMocks();
    (env as { DEMO_MODE: string }).DEMO_MODE = "true";
  });

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.SITE;
    } else {
      process.env.SITE = originalSite;
    }
  });

  it("returns 404 when DEMO_MODE is false", async () => {
    (env as { DEMO_MODE: string }).DEMO_MODE = "false";
    process.env.SITE = "kitchen";
    const req = new NextRequest("http://localhost:3001/demo-enter");
    const res = await handleDemoEnter(req);
    expect(res.status).toBe(404);
  });

  it("returns 404 on customer site", async () => {
    process.env.SITE = "customer";
    const req = new NextRequest("http://localhost:3000/demo-enter");
    const res = await handleDemoEnter(req);
    expect(res.status).toBe(404);
  });

  it("logs in demo kitchen user and redirects to /kitchen on kitchen site", async () => {
    process.env.SITE = "kitchen";
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockDemoKitchenUser as never);

    const req = new NextRequest("http://localhost:3001/demo-enter");
    const res = await handleDemoEnter(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3001/kitchen");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("dinepulse_kitchen_session");
  });

  it("logs in demo manager user and redirects to /admin on manager site", async () => {
    process.env.SITE = "manager";
    vi.mocked(db.query.staffUsers.findFirst).mockResolvedValueOnce(mockDemoManagerUser as never);

    const req = new NextRequest("http://localhost:3002/demo-enter");
    const res = await handleDemoEnter(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3002/admin");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("dinepulse_manager_session");
  });
});

describe("Site URL Origin Validation (validateSiteUrlOrigin)", () => {
  it("accepts valid http and https origins without paths", () => {
    expect(validateSiteUrlOrigin("http://localhost:3000")).toEqual({
      valid: true,
      origin: "http://localhost:3000",
    });
    expect(validateSiteUrlOrigin("https://manager.dinepulse.com")).toEqual({
      valid: true,
      origin: "https://manager.dinepulse.com",
    });
    expect(validateSiteUrlOrigin("")).toEqual({ valid: true });
    expect(validateSiteUrlOrigin(undefined)).toEqual({ valid: true });
  });

  it("rejects origins containing paths", () => {
    const res = validateSiteUrlOrigin("http://localhost:3000/kitchen");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("must be an absolute origin without a path");
  });

  it("rejects origins containing query parameters or hashes", () => {
    const res1 = validateSiteUrlOrigin("http://localhost:3000?tab=1");
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain("must not contain query parameters");

    const res2 = validateSiteUrlOrigin("http://localhost:3000#section");
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain("must not contain query parameters");
  });

  it("rejects non-http(s) schemes", () => {
    const res = validateSiteUrlOrigin("ftp://example.com");
    expect(res.valid).toBe(false);
    expect(res.error).toContain("must start with http:// or https://");
  });
});

describe("Site URL Resolution (src/lib/site-urls.ts)", () => {
  const origCustomer = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL;
  const origKitchen = process.env.NEXT_PUBLIC_KITCHEN_SITE_URL;
  const origManager = process.env.NEXT_PUBLIC_MANAGER_SITE_URL;

  afterEach(() => {
    if (origCustomer === undefined) delete process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL;
    else process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL = origCustomer;

    if (origKitchen === undefined) delete process.env.NEXT_PUBLIC_KITCHEN_SITE_URL;
    else process.env.NEXT_PUBLIC_KITCHEN_SITE_URL = origKitchen;

    if (origManager === undefined) delete process.env.NEXT_PUBLIC_MANAGER_SITE_URL;
    else process.env.NEXT_PUBLIC_MANAGER_SITE_URL = origManager;
  });

  it("resolves relative paths for unified mode (currentSite='all')", () => {
    const urls = getSiteUrls("all");
    expect(urls.customer).toBe("/");
    expect(urls.kitchen).toBe("/kitchen");
    expect(urls.manager).toBe("/admin");

    expect(resolveSiteUrl("kitchen", "/kitchen", "all")).toBe("/kitchen");
    expect(resolveSiteUrl("manager", "/admin", "all")).toBe("/admin");
    expect(resolveSiteUrl("customer", "/t/demo-table-7", "all")).toBe("/t/demo-table-7");
    expect(resolveSiteUrl("kitchen", "/demo-enter", "all")).toBe("/demo-enter?role=kitchen");
    expect(resolveSiteUrl("manager", "/demo-enter", "all")).toBe("/demo-enter?role=manager");
  });

  it("returns null when site URLs are unconfigured in multi-site mode (no silent fallback to ports)", () => {
    delete process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL;
    delete process.env.NEXT_PUBLIC_KITCHEN_SITE_URL;
    delete process.env.NEXT_PUBLIC_MANAGER_SITE_URL;

    const urls = getSiteUrls("customer");
    expect(urls.customer).toBeNull();
    expect(urls.kitchen).toBeNull();
    expect(urls.manager).toBeNull();

    expect(resolveSiteUrl("kitchen", "/kitchen", "customer")).toBeNull();
    expect(resolveSiteUrl("manager", "/admin", "customer")).toBeNull();
    expect(resolveSiteUrl("customer", "/t/demo-table-7", "customer")).toBeNull();
  });

  it("resolves absolute URLs when site URLs are configured in multi-site mode", () => {
    process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL = "http://localhost:3000";
    process.env.NEXT_PUBLIC_KITCHEN_SITE_URL = "http://localhost:3001";
    process.env.NEXT_PUBLIC_MANAGER_SITE_URL = "http://localhost:3002";

    const urls = getSiteUrls("customer");
    expect(urls.customer).toBe("http://localhost:3000");
    expect(urls.kitchen).toBe("http://localhost:3001");
    expect(urls.manager).toBe("http://localhost:3002");

    expect(resolveSiteUrl("kitchen", "/kitchen", "customer")).toBe("http://localhost:3001/kitchen");
    expect(resolveSiteUrl("kitchen", "/demo-enter", "customer")).toBe("http://localhost:3001/demo-enter");
    expect(resolveSiteUrl("manager", "/admin", "customer")).toBe("http://localhost:3002/admin");
    expect(resolveSiteUrl("manager", "/demo-enter", "customer")).toBe("http://localhost:3002/demo-enter");
    expect(resolveSiteUrl("customer", "/t/demo-table-7", "manager")).toBe("http://localhost:3000/t/demo-table-7");
  });
});

describe("Web App Manifest (src/app/manifest.ts)", () => {
  const originalSite = process.env.SITE;
  const originalSiteName = process.env.NEXT_PUBLIC_SITE_NAME;

  afterEach(() => {
    if (originalSite === undefined) delete process.env.SITE;
    else process.env.SITE = originalSite;

    if (originalSiteName === undefined) delete process.env.NEXT_PUBLIC_SITE_NAME;
    else process.env.NEXT_PUBLIC_SITE_NAME = originalSiteName;
  });

  it("returns kitchen manifest with exact Prompt 5 specifications", () => {
    process.env.SITE = "kitchen";
    const m = manifest();

    expect(m.name).toBe("DinePulse Kitchen");
    expect(m.short_name).toBe("Kitchen");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("landscape");
    expect(m.icons).toEqual([
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ]);
  });

  it("returns manager manifest using NEXT_PUBLIC_SITE_NAME when provided", () => {
    process.env.SITE = "manager";
    process.env.NEXT_PUBLIC_SITE_NAME = "Custom Restaurant Hub";
    const m = manifest();

    expect(m.name).toBe("Custom Restaurant Hub");
    expect(m.short_name).toBe("Custom Restaurant Hub");
    expect(m.start_url).toBe("/admin");
    expect(m.display).toBe("standalone");
  });

  it("returns customer manifest using NEXT_PUBLIC_SITE_NAME when provided", () => {
    process.env.SITE = "customer";
    process.env.NEXT_PUBLIC_SITE_NAME = "Masala Lane Dine In";
    const m = manifest();

    expect(m.name).toBe("Masala Lane Dine In");
    expect(m.short_name).toBe("Masala Lane Dine In");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("portrait");
  });
});
