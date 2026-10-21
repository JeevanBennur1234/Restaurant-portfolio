import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import nextConfig from "../next.config";
import { hasSelectableCustomizations } from "@/components/guest/menu-item-card";
import { validateEnvForSite } from "../scripts/check-env";
import type { GuestModifier } from "@/lib/api/types";

describe("Customer Menu Audit Fixes & Verification", () => {
  const root = process.cwd();

  describe("P0: Dish Images & Remote Host Whitelisting", () => {
    it("restricts images.remotePatterns strictly to trusted Supabase hosts", () => {
      const patterns = nextConfig.images?.remotePatterns ?? [];
      expect(patterns.length).toBeGreaterThan(0);

      // Verify Supabase pattern is present
      const hasSupabase = patterns.some((p) => p.hostname === "*.supabase.co");
      expect(hasSupabase).toBe(true);

      // Verify unneeded external hosts are eliminated
      const unneededHosts = [
        "images.unsplash.com",
        "plus.unsplash.com",
        "res.cloudinary.com",
        "images.pexels.com",
        "img.freepik.com",
      ];

      for (const host of unneededHosts) {
        const found = patterns.some((p) => p.hostname === host);
        expect(found, `Host ${host} should not be in remotePatterns`).toBe(false);
      }
    });

    it("ensures local image assets exist for all 31 menu dishes", () => {
      const dishesDir = path.resolve(root, "public/images/dishes");
      expect(fs.existsSync(dishesDir)).toBe(true);

      const files = fs.readdirSync(dishesDir);
      expect(files.length).toBeGreaterThanOrEqual(31);

      // Verify Ghee Rice local asset is present
      const hasGheeRiceWebp = files.includes("ghee-rice.webp");
      const hasGheeRiceJpg = files.includes("ghee-rice.jpg");
      expect(hasGheeRiceWebp || hasGheeRiceJpg).toBe(true);
    });
  });

  describe("P0: Ghee Rice Category Migration Script", () => {
    it("scripts/migrate-ghee-rice-category.ts exists with dry-run support and target slug", () => {
      const scriptPath = path.resolve(root, "scripts/migrate-ghee-rice-category.ts");
      expect(fs.existsSync(scriptPath)).toBe(true);

      const scriptContent = fs.readFileSync(scriptPath, "utf-8");
      expect(scriptContent).toContain("dum-biryanis-pulao");
      expect(scriptContent).toContain("dryRun");
      expect(scriptContent).toContain("migrateGheeRiceCategory");
    });
  });

  describe("P1: SEO Metadata on Tokenized Routes", () => {
    it("sets robots: { index: false, follow: false } in src/app/t/[token]/page.tsx", () => {
      const pagePath = path.resolve(root, "src/app/t/[token]/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      expect(content).toContain("robots:");
      expect(content).toContain("index: false");
      expect(content).toContain("follow: false");
    });

    it("sets robots: { index: false, follow: false } in src/app/t/[token]/order/[id]/page.tsx", () => {
      const orderTrackerPath = path.resolve(root, "src/app/t/[token]/order/[id]/page.tsx");
      const content = fs.readFileSync(orderTrackerPath, "utf-8");

      expect(content).toContain("robots:");
      expect(content).toContain("index: false");
      expect(content).toContain("follow: false");
    });

    it("sets defense-in-depth robots: { index: false, follow: false } in src/app/t/layout.tsx", () => {
      const layoutPath = path.resolve(root, "src/app/t/layout.tsx");
      expect(fs.existsSync(layoutPath)).toBe(true);

      const content = fs.readFileSync(layoutPath, "utf-8");
      expect(content).toContain("robots:");
      expect(content).toContain("index: false");
      expect(content).toContain("follow: false");
    });

    it("preserves public indexing on root layout (src/app/layout.tsx)", () => {
      const rootLayoutPath = path.resolve(root, "src/app/layout.tsx");
      const content = fs.readFileSync(rootLayoutPath, "utf-8");

      // Root metadata should NOT have noindex
      expect(content).not.toContain("index: false");
    });
  });

  describe("P1: Concept Preview Footer Suppression", () => {
    it("src/components/layout/global-footer.tsx suppresses footer on table routes and homepage", () => {
      const footerPath = path.resolve(root, "src/components/layout/global-footer.tsx");
      expect(fs.existsSync(footerPath)).toBe(true);

      const content = fs.readFileSync(footerPath, "utf-8");
      expect(content).toContain('pathname.startsWith("/t/")');
      expect(content).toContain('pathname === "/"');
      expect(content).toContain("return null;");
    });

    it("src/app/layout.tsx uses GlobalFooter instead of hardcoded <footer>", () => {
      const layoutPath = path.resolve(root, "src/app/layout.tsx");
      const content = fs.readFileSync(layoutPath, "utf-8");

      expect(content).toContain("<GlobalFooter />");
      expect(content).not.toContain('<footer className="border-t border-[var(--border-subtle)]');
    });
  });

  describe("P1: Payment Test Mode Environment Check", () => {
    it("warns when RAZORPAY_KEY_ID is rzp_test_* in production for customer site", () => {
      const testEnv = {
        SITE: "customer",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://postgres:pass@localhost:5432/dinepulse",
        APP_URL: "https://order.dinepulse.intallo.in",
        SESSION_SECRET: "at-least-32-characters-production-session-secret-string",
        NEXT_PUBLIC_SUPABASE_URL: "https://prod-project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "prod-anon-key-string",
        SUPABASE_SERVICE_ROLE_KEY: "prod-service-role-key-string",
        PAYMENTS_MODE: "online",
        RAZORPAY_KEY_ID: "rzp_test_simulated_key_123",
        RAZORPAY_KEY_SECRET: "real_secret_123",
        RAZORPAY_WEBHOOK_SECRET: "real_webhook_secret_123",
      };

      const result = validateEnvForSite(testEnv, { site: "customer", isProduction: true });
      const rzpItem = result.items.find((i) => i.name === "RAZORPAY_KEY_ID");

      expect(rzpItem).toBeDefined();
      expect(rzpItem?.status).toBe("WARN");
      expect(rzpItem?.message).toContain("rzp_test_*");
      expect(rzpItem?.message).toContain("Real customer transactions will not be processed");
    });
  });

  describe("P2: Search Logic for Modifiers & Spice Levels", () => {
    it("menu-view.tsx includes modifier names and group names in search query filtering", () => {
      const menuViewPath = path.resolve(root, "src/components/guest/menu-view.tsx");
      const content = fs.readFileSync(menuViewPath, "utf-8");

      expect(content).toContain("matchesModifiers");
      expect(content).toContain("mod.name.toLowerCase().includes(query)");
      expect(content).toContain("mod.groupName.toLowerCase().includes(query)");
    });
  });

  describe("P2: Customizable Badge Logic", () => {
    it("returns false for dishes without modifiers", () => {
      expect(hasSelectableCustomizations([])).toBe(false);
    });

    it("returns false for a dish with 1 required modifier (no user choices)", () => {
      // Like Subz Tarkari Dum Biryani: only 1 raita, and it is required
      const singleRequired: GuestModifier[] = [
        {
          id: "mod-1",
          groupName: "Raita",
          name: "Pomegranate Mint Raita",
          pricePaise: 0,
          isRequired: true,
        },
      ];
      expect(hasSelectableCustomizations(singleRequired)).toBe(false);
    });

    it("returns true for a dish with multiple options in a group (choice between A or B)", () => {
      const radioGroup: GuestModifier[] = [
        {
          id: "mod-1",
          groupName: "Spice Level",
          name: "Punjab Regular Spice",
          pricePaise: 0,
          isRequired: true,
        },
        {
          id: "mod-2",
          groupName: "Spice Level",
          name: "Extra Fiery Guntur Chilli",
          pricePaise: 0,
          isRequired: false,
        },
      ];
      expect(hasSelectableCustomizations(radioGroup)).toBe(true);
    });

    it("returns true for a dish with 1 optional modifier (user can choose whether to add it)", () => {
      const singleOptional: GuestModifier[] = [
        {
          id: "mod-1",
          groupName: "Garnish",
          name: "Smoked Silver Leaf & Pistachio",
          pricePaise: 4000,
          isRequired: false,
        },
      ];
      expect(hasSelectableCustomizations(singleOptional)).toBe(true);
    });
  });

  describe("P2: Cart Discoverability & Responsiveness", () => {
    it("guest-header.tsx displays table badge and header cart trigger with testid and aria-label", () => {
      const headerPath = path.resolve(root, "src/components/guest/guest-header.tsx");
      const content = fs.readFileSync(headerPath, "utf-8");

      expect(content).toContain('data-testid="header-cart-btn"');
      expect(content).toContain('data-testid="header-cart-count"');
      expect(content).toContain("ShoppingBag");
      expect(content).toContain("useOptionalCart");
      expect(content).toContain("tableLabel");
    });
  });
});
