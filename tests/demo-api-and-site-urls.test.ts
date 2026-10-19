import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { getSiteUrls, resolveSiteUrl, validateSiteUrlOrigin } from "@/lib/site-urls";
import manifest from "@/app/manifest";

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
    expect(resolveSiteUrl("customer", "/t/table-1", "all")).toBe("/t/table-1");
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
    expect(resolveSiteUrl("customer", "/t/table-1", "customer")).toBeNull();
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
    expect(resolveSiteUrl("manager", "/admin", "customer")).toBe("http://localhost:3002/admin");
    expect(resolveSiteUrl("customer", "/t/table-1", "manager")).toBe("http://localhost:3000/t/table-1");
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
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
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

describe("PWA Icons (public/icons/)", () => {
  function readPngDimensions(filePath: string): { width: number; height: number } {
    const fullPath = path.resolve(process.cwd(), filePath);
    const buf = fs.readFileSync(fullPath);
    expect(buf.slice(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(buf.slice(12, 16).toString("ascii")).toBe("IHDR");
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { width, height };
  }

  it("public/icons/icon-192.png is exactly 192x192 pixels", () => {
    const dims = readPngDimensions("public/icons/icon-192.png");
    expect(dims.width).toBe(192);
    expect(dims.height).toBe(192);
  });

  it("public/icons/icon-512.png is exactly 512x512 pixels", () => {
    const dims = readPngDimensions("public/icons/icon-512.png");
    expect(dims.width).toBe(512);
    expect(dims.height).toBe(512);
  });

  it("public/icons/icon-maskable-512.png is exactly 512x512 pixels", () => {
    const dims = readPngDimensions("public/icons/icon-maskable-512.png");
    expect(dims.width).toBe(512);
    expect(dims.height).toBe(512);
  });

  it("legacy root public/icon-192.png and public/icon-512.png do not exist", () => {
    expect(fs.existsSync(path.resolve(process.cwd(), "public/icon-192.png"))).toBe(false);
    expect(fs.existsSync(path.resolve(process.cwd(), "public/icon-512.png"))).toBe(false);
  });
});
