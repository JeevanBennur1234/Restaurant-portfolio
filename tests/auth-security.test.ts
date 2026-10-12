import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Mock next/headers
const mockCookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn((name: string) => {
      const val = mockCookieStore.get(name);
      return val ? { name, value: val } : undefined;
    }),
    set: vi.fn((name: string, val: string) => {
      mockCookieStore.set(name, val);
    }),
    delete: vi.fn((name: string) => {
      mockCookieStore.delete(name);
    }),
  })),
  headers: vi.fn(async () => ({
    get: vi.fn(() => "127.0.0.1"),
  })),
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
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
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

import { db } from "@/server/db";
import bcrypt from "bcryptjs";
import {
  signSessionPayload,
  verifySessionToken,
  getStaffSession,
  authenticateStaff,
  clearStaffSessionCookie,
} from "@/server/auth";

describe("Staff Authentication Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.clear();
  });

  describe("Token Verification & Signature Integrity", () => {
    it("rejects expired tokens (exp in past)", () => {
      const now = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        userId: "user_123",
        sessionVersion: 1,
        iat: now - 3600 * 13, // issued 13 hours ago
        exp: now - 3600, // expired 1 hour ago
      };

      const token = signSessionPayload(expiredPayload);
      const result = verifySessionToken(token);

      expect(result).toBeNull();
    });

    it("rejects tampered signatures", () => {
      const now = Math.floor(Date.now() / 1000);
      const validPayload = {
        userId: "user_123",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600 * 12,
      };

      const token = signSessionPayload(validPayload);
      const [base64, signature] = token.split(".");

      // Tamper signature by replacing characters
      const tamperedSignature =
        signature.slice(0, -4) + (signature.endsWith("a") ? "b" : "a");
      const tamperedToken = `${base64}.${tamperedSignature}`;

      const result = verifySessionToken(tamperedToken);
      expect(result).toBeNull();
    });

    it("rejects tokens with tampered payload content", () => {
      const now = Math.floor(Date.now() / 1000);
      const originalPayload = {
        userId: "user_123",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600 * 12,
      };

      const token = signSessionPayload(originalPayload);
      const [, signature] = token.split(".");

      // Modify payload to escalate userId
      const modifiedPayload = {
        ...originalPayload,
        userId: "admin_super_user",
      };
      const modifiedBase64 = Buffer.from(JSON.stringify(modifiedPayload)).toString(
        "base64url"
      );
      const forgedToken = `${modifiedBase64}.${signature}`;

      const result = verifySessionToken(forgedToken);
      expect(result).toBeNull();
    });

    it("successfully verifies valid unexpired tokens", () => {
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        userId: "user_123",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600 * 12,
      };

      const token = signSessionPayload(payload);
      const result = verifySessionToken(token);

      expect(result).not.toBeNull();
      expect(result?.userId).toBe("user_123");
      expect(result?.sessionVersion).toBe(1);
    });
  });

  describe("getStaffSession DB checks & deactivation", () => {
    it("rejects session if user is deactivated in database (isActive: false)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signSessionPayload({
        userId: "user_deactivated",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600 * 12,
      });

      mockCookieStore.set("dinepulse_staff_session", token);

      // DB returns user with isActive = false
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue({
        id: "user_deactivated",
        username: "ex_chef",
        role: "kitchen",
        restaurantId: "rest_1",
        isActive: false, // DEACTIVATED
        sessionVersion: 1,
        updatedAt: new Date(now * 1000),
        restaurant: { name: "Masala Lane" },
      } as never);

      const session = await getStaffSession();
      expect(session).toBeNull();
    });

    it("rejects session if sessionVersion has changed (e.g. password changed)", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signSessionPayload({
        userId: "user_123",
        sessionVersion: 1, // Old session version
        iat: now,
        exp: now + 3600 * 12,
      });

      mockCookieStore.set("dinepulse_staff_session", token);

      // DB user has bumped sessionVersion to 2
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue({
        id: "user_123",
        username: "chef",
        role: "kitchen",
        restaurantId: "rest_1",
        isActive: true,
        sessionVersion: 2, // BUMPED
        updatedAt: new Date(now * 1000),
        restaurant: { name: "Masala Lane" },
      } as never);

      const session = await getStaffSession();
      expect(session).toBeNull();
    });

    it("rejects session if user updatedAt is newer than session iat", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signSessionPayload({
        userId: "user_123",
        sessionVersion: 1,
        iat: now - 500, // session created 500s ago
        exp: now + 3600 * 12,
      });

      mockCookieStore.set("dinepulse_staff_session", token);

      // Password changed 100s ago (updatedAt > iat)
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue({
        id: "user_123",
        username: "chef",
        role: "kitchen",
        restaurantId: "rest_1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date((now - 100) * 1000), // Newer than iat
        restaurant: { name: "Masala Lane" },
      } as never);

      const session = await getStaffSession();
      expect(session).toBeNull();
    });

    it("succeeds and loads role & restaurant from DB row when user is active", async () => {
      const now = Math.floor(Date.now() / 1000);
      const token = signSessionPayload({
        userId: "user_active",
        sessionVersion: 1,
        iat: now,
        exp: now + 3600 * 12,
      });

      mockCookieStore.set("dinepulse_staff_session", token);

      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue({
        id: "user_active",
        username: "manager_sam",
        role: "manager",
        restaurantId: "rest_1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(now * 1000),
        restaurant: { name: "Masala Lane" },
      } as never);

      const session = await getStaffSession();
      expect(session).not.toBeNull();
      expect(session?.userId).toBe("user_active");
      expect(session?.role).toBe("manager");
      expect(session?.restaurantName).toBe("Masala Lane");
    });
  });

  describe("authenticateStaff timing safety & rate limiting", () => {
    it("runs dummy compare when username does not exist and returns generic error", async () => {
      const compareSpy = vi.spyOn(bcrypt, "compare");
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue(null as never);
      vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue(null as never);

      const result = await authenticateStaff("nonexistent_user", "password123", "1.1.1.1");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid username or password");
      // Verify bcrypt.compare was called against dummy hash to prevent timing leak
      expect(compareSpy).toHaveBeenCalled();
    });

    it("never accepts hardcoded demo fallback credentials if user is not in database", async () => {
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue(null as never);
      vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue(null as never);

      const res1 = await authenticateStaff("kitchen", "kitchen123", "1.1.1.1");
      expect(res1.success).toBe(false);
      expect(res1.error).toBe("Invalid username or password");

      const res2 = await authenticateStaff("manager", "Manager@123", "1.1.1.1");
      expect(res2.success).toBe(false);
      expect(res2.error).toBe("Invalid username or password");
    });

    it("blocks after 5 failed attempts per username+IP in 15 minutes", async () => {
      // Simulate 5 existing failed attempts in current window
      vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue({
        key: "targetuser:1.2.3.4",
        count: 5,
        windowStart: new Date(Date.now() - 2 * 60 * 1000), // 2 min ago
      } as never);

      const result = await authenticateStaff("targetuser", "wrongpass", "1.2.3.4");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Too many failed login attempts. Please try again in 15 minutes."
      );
      // DB user lookup should NOT even be reached when blocked by rate limiter
      expect(db.query.staffUsers.findFirst).not.toHaveBeenCalled();
    });

    it("allows login when password is correct and clears rate limit record", async () => {
      const hash = await bcrypt.hash("correct_password", 10);
      vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue(null as never);
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue({
        id: "staff_1",
        username: "chef",
        passwordHash: hash,
        role: "kitchen",
        restaurantId: "rest_1",
        isActive: true,
        sessionVersion: 1,
        updatedAt: new Date(),
        restaurant: { name: "Masala Lane" },
      } as never);

      const result = await authenticateStaff("chef", "correct_password", "1.2.3.4");

      expect(result.success).toBe(true);
      expect(result.session?.username).toBe("chef");
      expect(db.delete).toHaveBeenCalled(); // Cleared failed attempts
      expect(mockCookieStore.get("dinepulse_staff_session")).toBeDefined();
    });

    it("clearStaffSessionCookie deletes the cookie on logout", async () => {
      mockCookieStore.set("dinepulse_staff_session", "existing_token");
      await clearStaffSessionCookie();
      expect(mockCookieStore.get("dinepulse_staff_session")).toBeUndefined();
    });
  });
});
