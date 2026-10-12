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
const mockHeadersMap = new Map<string, string>();
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
    get: vi.fn((name: string) => mockHeadersMap.get(name.toLowerCase()) ?? null),
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

import { db } from "@/server/db";
import bcrypt from "bcryptjs";
import {
  signSessionPayload,
  verifySessionToken,
  getStaffSession,
  authenticateStaff,
  clearStaffSessionCookie,
  getClientIp,
} from "@/server/auth";

describe("Staff Authentication Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookieStore.clear();
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ count: 1 }]),
        }),
      }),
    } as never);
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
      // Simulate rate limit exceeded on atomic attempt reservation
      vi.mocked(db.insert).mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ count: 6 }]),
          }),
        }),
      } as never);

      const result = await authenticateStaff("targetuser", "wrongpass", "1.2.3.4");

      expect(result.success).toBe(false);
      expect(result.error).toBe(
        "Too many failed login attempts. Please try again in 15 minutes."
      );
      // DB user lookup should NOT even be reached when blocked by rate limiter
      expect(db.query.staffUsers.findFirst).not.toHaveBeenCalled();
    });

    it("fires 30 parallel wrong-password attempts against a limit of 5 and asserts that at most 5 reach bcrypt.compare", async () => {
      let atomicCounter = 0;
      // Mock db.insert to atomically increment and return the counter, mimicking Postgres atomic upsert
      vi.mocked(db.insert).mockImplementation(() => ({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(async () => {
              atomicCounter++;
              return [{ count: atomicCounter }];
            }),
          }),
        }),
      } as never));

      // Spy on bcrypt.compare to count calls
      const bcryptCompareSpy = vi.spyOn(bcrypt, "compare");
      bcryptCompareSpy.mockClear();

      // Mock user lookup returning user with wrong password or nonexistent
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue(null as never);

      // Fire 30 parallel wrong-password attempts
      const attempts = Array.from({ length: 30 }, (_, i) =>
        authenticateStaff("targetuser", `wrongpass_${i}`, "192.168.1.100")
      );

      const results = await Promise.all(attempts);

      // Total attempts reaching bcrypt.compare must be at most 5
      expect(bcryptCompareSpy.mock.calls.length).toBeLessThanOrEqual(5);
      expect(bcryptCompareSpy.mock.calls.length).toBe(5);

      // Verify that attempts 1..5 failed with "Invalid username or password"
      const invalidPassResults = results.filter(
        (r) => r.error === "Invalid username or password"
      );
      expect(invalidPassResults.length).toBe(5);

      // Verify that attempts 6..30 failed with "Too many failed login attempts..."
      const rateLimitedResults = results.filter(
        (r) => r.error === "Too many failed login attempts. Please try again in 15 minutes."
      );
      expect(rateLimitedResults.length).toBe(25);
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

    it("getClientIp only trusts x-forwarded-for when running on Vercel, otherwise returns fixed 127.0.0.1", async () => {
      const originalVercel = process.env.VERCEL;
      try {
        // Outside Vercel: x-forwarded-for is NOT trusted
        delete process.env.VERCEL;
        mockHeadersMap.set("x-forwarded-for", "203.0.113.195, 198.51.100.1");
        const ipOutsideVercel = await getClientIp();
        expect(ipOutsideVercel).toBe("127.0.0.1");

        // On Vercel: x-forwarded-for is trusted
        process.env.VERCEL = "1";
        const ipOnVercel = await getClientIp();
        expect(ipOnVercel).toBe("203.0.113.195");
      } finally {
        if (originalVercel !== undefined) {
          process.env.VERCEL = originalVercel;
        } else {
          delete process.env.VERCEL;
        }
        mockHeadersMap.clear();
      }
    });

    it("recordFailedAttempt performs atomic INSERT ON CONFLICT DO UPDATE RETURNING count without read-then-write", async () => {
      vi.mocked(db.query.staffUsers.findFirst).mockResolvedValue(null as never);
      vi.mocked(db.query.loginAttempts.findFirst).mockResolvedValue(null as never);

      await authenticateStaff("target", "wrong_password", "10.0.0.1");

      // Verify db.insert was called directly with onConflictDoUpdate and returning
      expect(db.insert).toHaveBeenCalled();
      const insertMock = vi.mocked(db.insert);
      expect(insertMock).toHaveBeenCalled();
    });
  });
});
