import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateOrigin,
  requireStaff,
  requireTableToken,
  getClientIpFromRequest,
} from "@/server/api/guards";
import * as authModule from "@/server/auth";
import { db } from "@/server/db";

vi.mock("@/server/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof authModule>();
  return {
    ...actual,
    getStaffSession: vi.fn(),
  };
});

describe("API Guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Origin Check", () => {
    it("rejects request when Origin header is completely missing", () => {
      const req = new Request("https://example.com/api/v1/auth/logout", {
        method: "POST",
        headers: { host: "example.com" },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("rejects request when Origin does not match host", () => {
      const req = new Request("https://example.com/api/v1/auth/logout", {
        method: "POST",
        headers: {
          host: "example.com",
          origin: "https://evil-attacker.com",
        },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("allows request when Origin host matches request host", () => {
      const req = new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      });
      expect(validateOrigin(req)).toBe(true);
    });

    it("allows request when Origin matches x-forwarded-host", () => {
      const req = new Request("https://dinepulse.vercel.app/api/v1/auth/logout", {
        method: "POST",
        headers: {
          "x-forwarded-host": "dinepulse.vercel.app",
          origin: "https://dinepulse.vercel.app",
        },
      });
      expect(validateOrigin(req)).toBe(true);
    });

    it("rejects spoofed x-forwarded-host in cross-origin request when trusted proxy is unset", () => {
      delete process.env.VERCEL;
      delete process.env.TRUST_PROXY;
      delete process.env.TRUSTED_PROXY;

      const req = new Request("https://example.com/api/v1/auth/logout", {
        method: "POST",
        headers: {
          host: "example.com",
          "x-forwarded-host": "evil-attacker.com",
          origin: "https://evil-attacker.com",
        },
      });
      expect(validateOrigin(req)).toBe(false);
    });

    it("allows verified x-forwarded-host in non-Vercel deployment when TRUST_PROXY is enabled", () => {
      process.env.TRUST_PROXY = "true";
      try {
        const req = new Request("http://internal-node-server:3000/api/v1/auth/logout", {
          method: "POST",
          headers: {
            host: "internal-node-server:3000",
            "x-forwarded-host": "myrestaurant.com",
            origin: "https://myrestaurant.com",
          },
        });
        expect(validateOrigin(req)).toBe(true);
      } finally {
        delete process.env.TRUST_PROXY;
      }
    });
  });

  describe("Client IP Extraction", () => {
    const originalVercel = process.env.VERCEL;
    const originalTrustProxy = process.env.TRUST_PROXY;

    afterEach(() => {
      if (originalVercel === undefined) {
        delete process.env.VERCEL;
      } else {
        process.env.VERCEL = originalVercel;
      }
      if (originalTrustProxy === undefined) {
        delete process.env.TRUST_PROXY;
      } else {
        process.env.TRUST_PROXY = originalTrustProxy;
      }
    });

    it("ignores spoofed x-forwarded-for and x-real-ip when VERCEL and TRUST_PROXY are unset", () => {
      delete process.env.VERCEL;
      delete process.env.TRUST_PROXY;
      const req = new Request("https://example.com/api/v1/auth/login", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18",
          "x-real-ip": "198.51.100.17",
        },
      });
      expect(getClientIpFromRequest(req)).toBe("127.0.0.1");
    });

    it("honors x-forwarded-for when VERCEL is set", () => {
      process.env.VERCEL = "1";
      const req = new Request("https://example.com/api/v1/auth/login", {
        headers: {
          "x-forwarded-for": "203.0.113.195, 70.41.3.18",
        },
      });
      expect(getClientIpFromRequest(req)).toBe("203.0.113.195");
    });

    it("honors x-forwarded-for and extracts distinct client IPs when TRUST_PROXY is set outside Vercel", () => {
      delete process.env.VERCEL;
      process.env.TRUST_PROXY = "true";

      const reqUser1 = new Request("https://example.com/api/v1/customer/menu", {
        headers: {
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
      });
      const reqUser2 = new Request("https://example.com/api/v1/customer/menu", {
        headers: {
          "x-forwarded-for": "198.51.100.20, 10.0.0.1",
        },
      });

      const ip1 = getClientIpFromRequest(reqUser1);
      const ip2 = getClientIpFromRequest(reqUser2);

      expect(ip1).toBe("203.0.113.10");
      expect(ip2).toBe("198.51.100.20");
      expect(ip1).not.toBe(ip2);
      expect(ip1).not.toBe("127.0.0.1");
      expect(ip2).not.toBe("127.0.0.1");
    });

    it("honors cf-connecting-ip and x-real-ip when TRUST_PROXY is set", () => {
      delete process.env.VERCEL;
      process.env.TRUST_PROXY = "true";

      const reqCf = new Request("https://example.com/api/v1/auth/login", {
        headers: {
          "cf-connecting-ip": "192.0.2.77",
        },
      });
      expect(getClientIpFromRequest(reqCf)).toBe("192.0.2.77");

      const reqReal = new Request("https://example.com/api/v1/auth/login", {
        headers: {
          "x-real-ip": "192.0.2.88",
        },
      });
      expect(getClientIpFromRequest(reqReal)).toBe("192.0.2.88");
    });

    it("honors x-real-ip when VERCEL is set and x-forwarded-for is missing", () => {
      process.env.VERCEL = "1";
      const req = new Request("https://example.com/api/v1/auth/login", {
        headers: {
          "x-real-ip": "198.51.100.17",
        },
      });
      expect(getClientIpFromRequest(req)).toBe("198.51.100.17");
    });

    it("falls back to 127.0.0.1 when VERCEL is set but no proxy headers present", () => {
      process.env.VERCEL = "1";
      const req = new Request("https://example.com/api/v1/auth/login");
      expect(getClientIpFromRequest(req)).toBe("127.0.0.1");
    });
  });

  describe("requireStaff Guard", () => {
    it("returns 401 UNAUTHENTICATED when session is null", async () => {
      vi.mocked(authModule.getStaffSession).mockResolvedValue(null);

      const res = await requireStaff(["manager"]);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(401);
        expect(res.error.code).toBe("UNAUTHENTICATED");
      }
    });

    it("returns 403 FORBIDDEN when user role does not match required roles", async () => {
      vi.mocked(authModule.getStaffSession).mockResolvedValue({
        userId: "user-1",
        username: "chef",
        role: "kitchen",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        isDemo: false,
      });

      const res = await requireStaff(["manager", "admin"]);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(403);
        expect(res.error.code).toBe("FORBIDDEN");
      }
    });

    it("returns actor when staff has matching role", async () => {
      vi.mocked(authModule.getStaffSession).mockResolvedValue({
        userId: "user-1",
        username: "mgr",
        role: "manager",
        restaurantId: "rest-1",
        restaurantName: "Masala Lane",
        isDemo: false,
      });

      const res = await requireStaff(["manager", "admin"]);
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.actor.userId).toBe("user-1");
      }
    });
  });

  describe("requireTableToken Guard", () => {
    it("returns 400 VALIDATION when token is missing", async () => {
      const req = new Request("https://example.com/api/v1/customer/orders/123");
      const res = await requireTableToken(req);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(400);
        expect(res.error.code).toBe("VALIDATION");
      }
    });

    it("returns 400 VALIDATION when token has invalid format", async () => {
      const req = new Request("https://example.com/api/v1/customer/orders/123", {
        headers: { "x-table-token": "bad token with spaces!" },
      });
      const res = await requireTableToken(req);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(400);
        expect(res.error.code).toBe("VALIDATION");
      }
    });

    it("returns 404 NOT_FOUND when table does not exist in DB", async () => {
      vi.spyOn(db.query.tables, "findFirst").mockResolvedValueOnce(undefined);

      const req = new Request("https://example.com/api/v1/customer/orders/123", {
        headers: { "x-table-token": "valid-token-123" },
      });
      const res = await requireTableToken(req);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.status).toBe(404);
        expect(res.error.code).toBe("NOT_FOUND");
      }
    });
  });
});
