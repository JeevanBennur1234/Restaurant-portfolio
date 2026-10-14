import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  sessionCookieNameForSite,
  allowedRolesForSite,
  getSite,
} from "@/server/site";
import {
  signSessionPayload,
  verifySessionToken,
  authenticateStaff,
  getStaffSession,
} from "@/server/auth";
import { db } from "@/server/db";
// Mock cookies store for testing getStaffSession
const mockCookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const val = mockCookieStore.get(name);
      return val ? { name, value: val } : undefined;
    },
    set: (name: string, value: string) => {
      mockCookieStore.set(name, value);
    },
    delete: (name: string) => {
      mockCookieStore.delete(name);
    },
  })),
  headers: vi.fn(async () => new Headers()),
}));

// Mock database
vi.mock("@/server/db", () => {
  return {
    db: {
      query: {
        staffUsers: {
          findFirst: vi.fn(),
        },
        loginAttempts: {
          findFirst: vi.fn(),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ count: 1 }]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
  };
});

describe("Multi-Site Authentication & Role Gating", () => {
  const originalSite = process.env.SITE;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.clear();
  });

  afterEach(() => {
    if (originalSite === undefined) {
      delete process.env.SITE;
    } else {
      process.env.SITE = originalSite;
    }
  });

  describe("Session Cookie Name Per Site", () => {
    it("returns correct cookie name based on site parameter", () => {
      expect(sessionCookieNameForSite("kitchen")).toBe("dinepulse_kitchen_session");
      expect(sessionCookieNameForSite("manager")).toBe("dinepulse_manager_session");
      expect(sessionCookieNameForSite("customer")).toBe("dinepulse_staff_session");
      expect(sessionCookieNameForSite("all")).toBe("dinepulse_staff_session");
    });

    it("respects process.env.SITE when no parameter is provided", () => {
      process.env.SITE = "kitchen";
      expect(sessionCookieNameForSite()).toBe("dinepulse_kitchen_session");

      process.env.SITE = "manager";
      expect(sessionCookieNameForSite()).toBe("dinepulse_manager_session");

      process.env.SITE = "customer";
      expect(sessionCookieNameForSite()).toBe("dinepulse_staff_session");

      process.env.SITE = "all";
      expect(sessionCookieNameForSite()).toBe("dinepulse_staff_session");
    });
  });

  describe("Allowed Roles and Site Identity", () => {
    it("returns correct roles for each site", () => {
      expect(allowedRolesForSite("kitchen")).toEqual(["kitchen", "manager", "admin"]);
      expect(allowedRolesForSite("manager")).toEqual(["manager", "admin"]);
      expect(allowedRolesForSite("customer")).toEqual([]);
      expect(allowedRolesForSite("all")).toEqual(["kitchen", "manager", "admin"]);
    });

    it("getSite returns current site identity", () => {
      process.env.SITE = "kitchen";
      expect(getSite()).toBe("kitchen");

      process.env.SITE = "manager";
      expect(getSite()).toBe("manager");
    });
  });

  describe("Token Audience ('aud') Enforcement", () => {
    it("accepts token when aud matches the current site", () => {
      process.env.SITE = "kitchen";
      const now = Math.floor(Date.now() / 1000);
      const token = signSessionPayload({
        userId: "user-1",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600,
        aud: "kitchen",
      });

      const verified = verifySessionToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("user-1");
      expect(verified?.aud).toBe("kitchen");
    });

    it("rejects token when aud belongs to another site", () => {
      // Token signed for kitchen
      const now = Math.floor(Date.now() / 1000);
      const kitchenToken = signSessionPayload({
        userId: "user-1",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600,
        aud: "kitchen",
      });

      // Attempt verification on manager site
      process.env.SITE = "manager";
      const onManager = verifySessionToken(kitchenToken);
      expect(onManager).toBeNull();

      // Attempt verification on customer or unified site
      process.env.SITE = "customer";
      expect(verifySessionToken(kitchenToken)).toBeNull();

      process.env.SITE = "all";
      expect(verifySessionToken(kitchenToken)).toBeNull();
    });

    it("rejects legacy tokens without an 'aud' claim", () => {
      process.env.SITE = "kitchen";
      const now = Math.floor(Date.now() / 1000);

      // Create a token missing the aud claim entirely
      const payloadWithoutAud = {
        userId: "user-legacy",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600,
      };

      const base64 = Buffer.from(JSON.stringify(payloadWithoutAud)).toString("base64url");
      const signature = crypto
        .createHmac("sha256", process.env.SESSION_SECRET!)
        .update(base64)
        .digest("base64url");
      const legacyToken = `${base64}.${signature}`;

      const verified = verifySessionToken(legacyToken);
      expect(verified).toBeNull();
    });
  });

  describe("Role Gating in authenticateStaff", () => {
    const passwordHash = bcrypt.hashSync("correct_password_123", 10);

    it("rejects kitchen role on manager site only AFTER checking password", async () => {
      process.env.SITE = "manager";

      // Mock DB findFirst to return a user with role 'kitchen'
      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "staff-kitchen-1",
        username: "chef_ramesh",
        passwordHash,
        role: "kitchen",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      // 1. Wrong password: must return generic error "Invalid username or password"
      const wrongPassResult = await authenticateStaff(
        "chef_ramesh",
        "wrong_password",
        "127.0.0.1"
      );
      expect(wrongPassResult.success).toBe(false);
      expect(wrongPassResult.error).toBe("Invalid username or password");

      // 2. Correct password, but role 'kitchen' is disallowed on manager site:
      // must return specific error "This account can't sign in on this site."
      const correctPassResult = await authenticateStaff(
        "chef_ramesh",
        "correct_password_123",
        "127.0.0.1"
      );
      expect(correctPassResult.success).toBe(false);
      expect(correctPassResult.error).toBe("This account can't sign in on this site.");
    });

    it("allows manager and admin roles to authenticate on manager site", async () => {
      process.env.SITE = "manager";

      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "staff-mgr-1",
        username: "manager_priya",
        passwordHash,
        role: "manager",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      const res = await authenticateStaff(
        "manager_priya",
        "correct_password_123",
        "127.0.0.1"
      );
      expect(res.success).toBe(true);
      expect(res.session?.role).toBe("manager");
      // Session cookie should be set for manager
      expect(mockCookieStore.has("dinepulse_manager_session")).toBe(true);
    });

    it("allows kitchen, manager, and admin roles on kitchen site", async () => {
      process.env.SITE = "kitchen";

      // 1. Kitchen role
      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "staff-kitchen-1",
        username: "chef_ramesh",
        passwordHash,
        role: "kitchen",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      const kitchenRes = await authenticateStaff(
        "chef_ramesh",
        "correct_password_123",
        "127.0.0.1"
      );
      expect(kitchenRes.success).toBe(true);
      expect(mockCookieStore.has("dinepulse_kitchen_session")).toBe(true);

      // 2. Manager role on kitchen site
      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "staff-mgr-1",
        username: "manager_priya",
        passwordHash,
        role: "manager",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      const mgrRes = await authenticateStaff(
        "manager_priya",
        "correct_password_123",
        "127.0.0.1"
      );
      expect(mgrRes.success).toBe(true);
    });

    it("disallows all staff logins on customer site", async () => {
      process.env.SITE = "customer";

      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "staff-mgr-1",
        username: "manager_priya",
        passwordHash,
        role: "manager",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      const res = await authenticateStaff(
        "manager_priya",
        "correct_password_123",
        "127.0.0.1"
      );
      expect(res.success).toBe(false);
      expect(res.error).toBe("This account can't sign in on this site.");
    });
  });

  describe("getStaffSession Role Gate", () => {
    it("returns null if user's role is not allowed on current site", async () => {
      process.env.SITE = "manager";
      const now = Math.floor(Date.now() / 1000);

      // Token with aud: "manager"
      const token = signSessionPayload({
        userId: "user-kitchen",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600,
        aud: "manager",
      });
      mockCookieStore.set("dinepulse_manager_session", token);

      // DB user is kitchen role
      vi.spyOn(db.query.staffUsers, "findFirst").mockResolvedValue({
        id: "user-kitchen",
        username: "chef",
        role: "kitchen",
        restaurantId: "rest-1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(now * 1000),
        restaurant: { name: "Masala Lane" },
      } as never);

      const session = await getStaffSession();
      expect(session).toBeNull();
    });
  });
});
