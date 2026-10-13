import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateOrigin, requireStaff, requireTableToken } from "@/server/api/guards";
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
