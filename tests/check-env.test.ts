import { describe, it, expect } from "vitest";
import * as crypto from "node:crypto";
import {
  validateEnvForSite,
  getRegistrableDomain,
  formatResultTable,
} from "../scripts/check-env";

describe("check-env Script (scripts/check-env.ts)", () => {
  const validBaseEnv: Record<string, string> = {
    NODE_ENV: "production",
    SITE: "customer",
    DATABASE_URL: "postgresql://postgres:secret@pooler.supabase.co:6543/postgres?sslmode=require",
    SESSION_SECRET: "a-valid-session-secret-that-is-at-least-32-chars-long",
    NEXT_PUBLIC_APP_URL: "https://order.dinepulse.intallo.in",
    NEXT_PUBLIC_SUPABASE_URL: "https://xyzcompany.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_key",
    SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_service_key",
    PAYMENTS_MODE: "online",
    RAZORPAY_KEY_ID: "rzp_live_abc123456",
    RAZORPAY_KEY_SECRET: "secret_live_rzp_987654",
    RAZORPAY_WEBHOOK_SECRET: "webhook_live_secret_45678",
  };

  describe("Registrable Domain Extraction (getRegistrableDomain)", () => {
    it("recognizes localhost and 127.0.0.1", () => {
      expect(getRegistrableDomain("localhost")).toBe("localhost");
      expect(getRegistrableDomain("localhost:3000")).toBe("localhost");
      expect(getRegistrableDomain("127.0.0.1:3001")).toBe("127.0.0.1");
    });

    it("extracts root domain from standard subdomains", () => {
      expect(getRegistrableDomain("order.dinepulse.com")).toBe("dinepulse.com");
      expect(getRegistrableDomain("kitchen.dinepulse.com")).toBe("dinepulse.com");
      expect(getRegistrableDomain("manager.dinepulse.com")).toBe("dinepulse.com");
    });

    it("handles two-part ccTLDs correctly (e.g. .intallo.in, .co.uk)", () => {
      expect(getRegistrableDomain("order.dinepulse.intallo.in")).toBe("intallo.in");
      expect(getRegistrableDomain("kitchen.dinepulse.intallo.in")).toBe("intallo.in");
      expect(getRegistrableDomain("kitchen.site.co.uk")).toBe("site.co.uk");
    });

    it("treats vercel.app projects as separate domains (multi-tenant public suffix)", () => {
      expect(getRegistrableDomain("project-a.vercel.app")).toBe("project-a.vercel.app");
      expect(getRegistrableDomain("project-b.vercel.app")).toBe("project-b.vercel.app");
      expect(getRegistrableDomain("project-a.vercel.app")).not.toBe(
        getRegistrableDomain("project-b.vercel.app")
      );
    });
  });

  describe("Every Site Validation Rules", () => {
    it("passes for a fully configured production customer site", () => {
      const result = validateEnvForSite(validBaseEnv, { site: "customer" });
      expect(result.passed).toBe(true);
      expect(result.hasWarnings).toBe(false);
    });

    it("fails when SITE does not match target --site argument", () => {
      const result = validateEnvForSite({ ...validBaseEnv, SITE: "kitchen" }, { site: "customer" });
      expect(result.passed).toBe(false);
      const siteItem = result.items.find((i) => i.name === "SITE");
      expect(siteItem?.status).toBe("FAIL");
      expect(siteItem?.message).toContain("does not match target site");
    });

    it("fails when DATABASE_URL is missing or non-postgres", () => {
      const missingDb = validateEnvForSite({ ...validBaseEnv, DATABASE_URL: "" }, { site: "customer" });
      expect(missingDb.passed).toBe(false);
      expect(missingDb.items.find((i) => i.name === "DATABASE_URL")?.status).toBe("FAIL");

      const mysqlDb = validateEnvForSite(
        { ...validBaseEnv, DATABASE_URL: "mysql://user:pass@localhost/db" },
        { site: "customer" }
      );
      expect(mysqlDb.passed).toBe(false);
      expect(mysqlDb.items.find((i) => i.name === "DATABASE_URL")?.message).toContain("postgres");
    });

    it("fails when SESSION_SECRET is too short (<32 chars) or is a placeholder", () => {
      const shortSecret = validateEnvForSite(
        { ...validBaseEnv, SESSION_SECRET: "short-secret-only-24-chars" },
        { site: "customer" }
      );
      expect(shortSecret.passed).toBe(false);
      expect(shortSecret.items.find((i) => i.name === "SESSION_SECRET")?.message).toContain("at least 32 characters");

      const placeholderSecret = validateEnvForSite(
        { ...validBaseEnv, SESSION_SECRET: "placeholder_secret_with_more_than_32_characters_here" },
        { site: "customer" }
      );
      expect(placeholderSecret.passed).toBe(false);
      expect(placeholderSecret.items.find((i) => i.name === "SESSION_SECRET")?.message).toContain("placeholder");

      const oldSecret = validateEnvForSite(
        { ...validBaseEnv, SESSION_SECRET: "dinepulse_super_secret_staff_session_key_2026" },
        { site: "customer" }
      );
      expect(oldSecret.passed).toBe(false);
    });

    it("fails when NEXT_PUBLIC_APP_URL is invalid or contains path", () => {
      const withPath = validateEnvForSite(
        { ...validBaseEnv, NEXT_PUBLIC_APP_URL: "https://example.com/subdir" },
        { site: "customer" }
      );
      expect(withPath.passed).toBe(false);
      expect(withPath.items.find((i) => i.name === "NEXT_PUBLIC_APP_URL")?.status).toBe("FAIL");
    });

    it("fails when Supabase variables are missing or placeholders", () => {
      const badAnon = validateEnvForSite(
        { ...validBaseEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder_anon_key" },
        { site: "customer" }
      );
      expect(badAnon.passed).toBe(false);
      expect(badAnon.items.find((i) => i.name === "NEXT_PUBLIC_SUPABASE_ANON_KEY")?.status).toBe("FAIL");
    });
  });

  describe("Customer Site Rules", () => {
    it("requires Razorpay keys when PAYMENTS_MODE is 'online'", () => {
      const noRzp = validateEnvForSite(
        {
          ...validBaseEnv,
          PAYMENTS_MODE: "online",
          RAZORPAY_KEY_ID: "",
          RAZORPAY_KEY_SECRET: "",
          RAZORPAY_WEBHOOK_SECRET: "",
        },
        { site: "customer" }
      );
      expect(noRzp.passed).toBe(false);
      expect(noRzp.items.find((i) => i.name === "RAZORPAY_KEY_ID")?.status).toBe("FAIL");
      expect(noRzp.items.find((i) => i.name === "RAZORPAY_KEY_SECRET")?.status).toBe("FAIL");
      expect(noRzp.items.find((i) => i.name === "RAZORPAY_WEBHOOK_SECRET")?.status).toBe("FAIL");
    });

    it("allows omitting Razorpay keys when PAYMENTS_MODE is 'counter_only'", () => {
      const counterCustomer = validateEnvForSite(
        {
          ...validBaseEnv,
          PAYMENTS_MODE: "counter_only",
          RAZORPAY_KEY_ID: "",
          RAZORPAY_KEY_SECRET: "",
          RAZORPAY_WEBHOOK_SECRET: "",
        },
        { site: "customer" }
      );
      expect(counterCustomer.passed).toBe(true);
      expect(counterCustomer.items.find((i) => i.name === "RAZORPAY_KEY_ID")).toBeUndefined();
      expect(counterCustomer.items.find((i) => i.name === "PAYMENTS_MODE")?.status).toBe("PASS");
    });
  });

  describe("Kitchen and Manager Site Rules", () => {
    const kitchenBase = {
      ...validBaseEnv,
      SITE: "kitchen",
      NEXT_PUBLIC_APP_URL: "https://kitchen.dinepulse.intallo.in",
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_WEBHOOK_SECRET: "",
    };

    it("passes on kitchen site without Razorpay variables", () => {
      const validKitchen = validateEnvForSite(kitchenBase, { site: "kitchen" });
      expect(validKitchen.passed).toBe(true);
      expect(validKitchen.items.find((i) => i.name === "RAZORPAY_KEY_ID")).toBeUndefined();
    });

    it("passes on manager site without Razorpay variables", () => {
      const validManager = validateEnvForSite(
        {
          ...kitchenBase,
          SITE: "manager",
          NEXT_PUBLIC_APP_URL: "https://manager.dinepulse.intallo.in",
        },
        { site: "manager" }
      );
      expect(validManager.passed).toBe(true);
      expect(validManager.items.find((i) => i.name === "RAZORPAY_KEY_ID")).toBeUndefined();
    });

    it("validates FRAME_ANCESTORS if provided", () => {
      const invalidFrame = validateEnvForSite(
        { ...kitchenBase, FRAME_ANCESTORS: "https://evil.com/path" },
        { site: "kitchen" }
      );
      expect(invalidFrame.passed).toBe(false);
      expect(invalidFrame.items.find((i) => i.name === "FRAME_ANCESTORS")?.status).toBe("FAIL");

      const validFrame = validateEnvForSite(
        { ...kitchenBase, FRAME_ANCESTORS: "https://order.dinepulse.intallo.in" },
        { site: "kitchen" }
      );
      expect(validFrame.passed).toBe(true);
      expect(validFrame.items.find((i) => i.name === "FRAME_ANCESTORS")?.status).toBe("PASS");
    });
  });

  describe("Secret Hash Comparisons", () => {
    it("warns (not fail) when SESSION_SECRET hash differs from expected hash", () => {
      const secret = "a-valid-session-secret-that-is-at-least-32-chars-long";
      const expectedWrongHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const result = validateEnvForSite(
        { ...validBaseEnv, SESSION_SECRET: secret },
        { site: "customer", expectSecretHash: expectedWrongHash }
      );
      const hashItem = result.items.find((i) => i.name === "SESSION_SECRET_HASH");
      expect(hashItem?.status).toBe("WARN");
      expect(hashItem?.message).toContain("differs from expected");
      expect(result.hasWarnings).toBe(true);
    });

    it("passes when SESSION_SECRET hash matches expected hash", () => {
      const secret = "a-valid-session-secret-that-is-at-least-32-chars-long";
      const correctHash = crypto.createHash("sha256").update(secret).digest("hex");

      const result = validateEnvForSite(
        { ...validBaseEnv, SESSION_SECRET: secret },
        { site: "customer", expectSecretHash: correctHash }
      );
      const hashItem = result.items.find((i) => i.name === "SESSION_SECRET_HASH");
      expect(hashItem?.status).toBe("PASS");
    });
  });

  describe("Table Formatter (formatResultTable)", () => {
    it("produces readable table with summary line", () => {
      const result = validateEnvForSite(validBaseEnv, { site: "customer" });
      const table = formatResultTable(result);
      expect(table).toContain("DinePulse Environment Audit");
      expect(table).toContain("PASS");
      expect(table).toContain("DATABASE_URL");
      expect(table).toContain("Summary:");
    });
  });
});
