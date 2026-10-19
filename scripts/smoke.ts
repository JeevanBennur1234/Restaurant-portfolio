import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export interface SmokeTestConfig {
  customerUrl: string;
  kitchenUrl: string;
  managerUrl: string;
  demo?: boolean;
}

export interface SmokeCheckResult {
  site: "customer" | "kitchen" | "manager" | "all";
  name: string;
  status: "PASS" | "FAIL";
  message: string;
}

export interface SmokeSummary {
  passed: boolean;
  results: SmokeCheckResult[];
}

// Type for fetch function (allowing mock injection in tests)
export type FetchFunction = typeof fetch;

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function runSmokeTests(
  config: SmokeTestConfig,
  customFetch: FetchFunction = fetch
): Promise<SmokeSummary> {
  const customer = normalizeUrl(config.customerUrl);
  const kitchen = normalizeUrl(config.kitchenUrl);
  const manager = normalizeUrl(config.managerUrl);
  const isDemo = Boolean(config.demo);

  const results: SmokeCheckResult[] = [];

  async function checkEndpoint(
    site: "customer" | "kitchen" | "manager",
    name: string,
    url: string,
    options: RequestInit = {},
    validate: (res: Response, text: string) => { ok: boolean; message: string }
  ) {
    try {
      const res = await customFetch(url, {
        redirect: "follow",
        ...options,
      });
      const text = await res.text();
      const validation = validate(res, text);
      results.push({
        site,
        name,
        status: validation.ok ? "PASS" : "FAIL",
        message: validation.message,
      });
    } catch (err) {
      results.push({
        site,
        name,
        status: "FAIL",
        message: `Network/connection error fetching ${url}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 1. Health checks on each site: GET /api/v1/health returns 200 with success true
  const sites: Array<{ site: "customer" | "kitchen" | "manager"; url: string }> = [
    { site: "customer", url: customer },
    { site: "kitchen", url: kitchen },
    { site: "manager", url: manager },
  ];

  for (const s of sites) {
    await checkEndpoint(
      s.site,
      `GET /api/v1/health`,
      `${s.url}/api/v1/health`,
      {},
      (res, text) => {
        if (res.status !== 200) {
          return { ok: false, message: `Expected HTTP 200, received HTTP ${res.status}` };
        }
        try {
          const json = JSON.parse(text);
          if (json.success !== true) {
            return { ok: false, message: `Expected { success: true }, received: ${text.slice(0, 80)}` };
          }
          return { ok: true, message: `HTTP 200 OK, database healthy (success: true)` };
        } catch {
          return { ok: false, message: `Response was not valid JSON: ${text.slice(0, 80)}` };
        }
      }
    );
  }

  // 2. Customer site route checks:
  // GET / is 200, GET /kitchen is 404, GET /admin is 404, GET /api/v1/admin/orders is 404
  await checkEndpoint("customer", "GET /", `${customer}/`, {}, (res) => ({
    ok: res.status === 200,
    message: res.status === 200 ? "HTTP 200 OK (guest landing page)" : `Expected 200, got ${res.status}`,
  }));

  await checkEndpoint("customer", "GET /kitchen", `${customer}/kitchen`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  await checkEndpoint("customer", "GET /admin", `${customer}/admin`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  await checkEndpoint("customer", "GET /api/v1/admin/orders", `${customer}/api/v1/admin/orders`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  // 3. Kitchen site route checks:
  // GET / is 200, GET /admin is 404, GET /t/x is 404,
  // GET /manifest.webmanifest has name "DinePulse Kitchen", response header X-Robots-Tag contains noindex
  await checkEndpoint("kitchen", "GET /", `${kitchen}/`, {}, (res) => {
    const robots = res.headers.get("x-robots-tag") || "";
    const hasNoIndex = robots.toLowerCase().includes("noindex");
    if (res.status !== 200) {
      return { ok: false, message: `Expected 200, got ${res.status}` };
    }
    if (!hasNoIndex) {
      return { ok: false, message: `Expected X-Robots-Tag to contain noindex, got "${robots}"` };
    }
    return { ok: true, message: `HTTP 200 OK, X-Robots-Tag contains noindex ("${robots}")` };
  });

  await checkEndpoint("kitchen", "GET /admin", `${kitchen}/admin`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  await checkEndpoint("kitchen", "GET /t/x", `${kitchen}/t/x`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  await checkEndpoint("kitchen", "GET /manifest.webmanifest", `${kitchen}/manifest.webmanifest`, {}, (res, text) => {
    if (res.status !== 200) {
      return { ok: false, message: `Expected 200, got ${res.status}` };
    }
    try {
      const json = JSON.parse(text);
      if (json.short_name === "Kitchen" || json.name === "DinePulse Kitchen") {
        return { ok: true, message: `HTTP 200 OK, manifest short_name is "${json.short_name || 'Kitchen'}"` };
      }
      return { ok: false, message: `Expected manifest short_name "Kitchen" or name "DinePulse Kitchen", got "${json.short_name || json.name}"` };
    } catch {
      return { ok: false, message: `Invalid manifest JSON: ${text.slice(0, 80)}` };
    }
  });

  // 4. Manager site route checks:
  // GET / is 200, GET /kitchen is 404, X-Robots-Tag contains noindex
  await checkEndpoint("manager", "GET /", `${manager}/`, {}, (res) => {
    const robots = res.headers.get("x-robots-tag") || "";
    const hasNoIndex = robots.toLowerCase().includes("noindex");
    if (res.status !== 200) {
      return { ok: false, message: `Expected 200, got ${res.status}` };
    }
    if (!hasNoIndex) {
      return { ok: false, message: `Expected X-Robots-Tag to contain noindex, got "${robots}"` };
    }
    return { ok: true, message: `HTTP 200 OK, X-Robots-Tag contains noindex ("${robots}")` };
  });

  await checkEndpoint("manager", "GET /kitchen", `${manager}/kitchen`, {}, (res) => ({
    ok: res.status === 404,
    message: res.status === 404 ? "HTTP 404 Not Found (blocked by proxy)" : `Expected 404, got ${res.status}`,
  }));

  // 5. Security headers on every site: CSP present, X-Content-Type-Options nosniff, HSTS when https
  for (const s of sites) {
    await checkEndpoint(s.site, `Security Headers (${s.site})`, `${s.url}/`, {}, (res) => {
      const csp = res.headers.get("content-security-policy");
      const xcto = res.headers.get("x-content-type-options");
      const isHttps = s.url.startsWith("https://");
      const hsts = res.headers.get("strict-transport-security");

      if (!csp || csp.trim() === "") {
        return { ok: false, message: "Missing Content-Security-Policy header" };
      }
      if (!xcto || !xcto.toLowerCase().includes("nosniff")) {
        return { ok: false, message: `Expected X-Content-Type-Options: nosniff, got "${xcto}"` };
      }
      if (isHttps && (!hsts || hsts.trim() === "")) {
        return { ok: false, message: "Missing Strict-Transport-Security header on HTTPS origin" };
      }

      // In demo mode, verify kitchen and manager include customer origin in frame-ancestors
      if (isDemo && (s.site === "kitchen" || s.site === "manager")) {
        const customerOrigin = new URL(customer).origin;
        const cspLower = csp.toLowerCase();
        const hasFrameAncestors = cspLower.includes("frame-ancestors");
        const includesCustomer = csp.includes(customerOrigin);
        if (!hasFrameAncestors || !includesCustomer) {
          return {
            ok: false,
            message: `Expected CSP frame-ancestors to include customer origin "${customerOrigin}"`,
          };
        }
      }

      const hstsMsg = isHttps ? ", HSTS active" : " (HTTP origin, HSTS skipped)";
      return { ok: true, message: `CSP present, X-Content-Type-Options: nosniff${hstsMsg}` };
    });
  }

  // 6. With --demo: POST /api/v1/auth/login on kitchen and manager -> 200 and set-cookie
  if (isDemo) {
    await checkEndpoint(
      "kitchen",
      "POST /api/v1/auth/login (kitchen)",
      `${kitchen}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: kitchen,
        },
        body: JSON.stringify({
          username: "kitchen",
          password: process.env.SEED_KITCHEN_PASSWORD || "kitchen123",
        }),
      },
      (res, text) => {
        const setCookie = res.headers.get("set-cookie");
        if (res.status === 200 && setCookie) {
          return { ok: true, message: "HTTP 200 OK, set-cookie header present" };
        }
        if (res.status === 200 && !setCookie) {
          return { ok: false, message: "HTTP 200 OK but missing set-cookie header" };
        }
        return {
          ok: false,
          message: `Expected HTTP 200, got ${res.status}. Response: ${text.slice(0, 100)}`,
        };
      }
    );

    await checkEndpoint(
      "manager",
      "POST /api/v1/auth/login (manager)",
      `${manager}/api/v1/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: manager,
        },
        body: JSON.stringify({
          username: "manager",
          password: process.env.SEED_MANAGER_PASSWORD || "manager123",
        }),
      },
      (res, text) => {
        const setCookie = res.headers.get("set-cookie");
        if (res.status === 200 && setCookie) {
          return { ok: true, message: "HTTP 200 OK, set-cookie header present" };
        }
        if (res.status === 200 && !setCookie) {
          return { ok: false, message: "HTTP 200 OK but missing set-cookie header" };
        }
        return {
          ok: false,
          message: `Expected HTTP 200, got ${res.status}. Response: ${text.slice(0, 100)}`,
        };
      }
    );
  }

  const passed = results.every((r) => r.status === "PASS");

  return {
    passed,
    results,
  };
}

export function formatSmokeResults(summary: SmokeSummary): string {
  const lines: string[] = [];
  lines.push("\n🚀 DinePulse Production Smoke Tests");
  lines.push("─".repeat(88));
  lines.push(`${"Target".padEnd(12)} ${"Status".padEnd(8)} ${"Check".padEnd(36)} Details`);
  lines.push("─".repeat(88));

  for (const r of summary.results) {
    const symbol = r.status === "PASS" ? "✅ PASS" : "❌ FAIL";
    lines.push(
      `[${r.site.toUpperCase()}]`.padEnd(12) +
      ` ${symbol.padEnd(8)} ` +
      `${r.name.padEnd(36)} ` +
      r.message
    );
  }

  lines.push("─".repeat(88));
  const passCount = summary.results.filter((r) => r.status === "PASS").length;
  const failCount = summary.results.filter((r) => r.status === "FAIL").length;

  lines.push(`Summary: ${passCount} passed, ${failCount} failed (total: ${summary.results.length}).`);

  if (summary.passed) {
    lines.push("✨ All smoke checks PASSED!\n");
  } else {
    lines.push("💥 Smoke test FAILED — One or more deployment checks failed.\n");
  }

  return lines.join("\n");
}

function parseCliArgs(argv: string[]): SmokeTestConfig {
  let customerUrl =
    process.env.CUSTOMER_URL ||
    process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL ||
    "http://localhost:3000";
  let kitchenUrl =
    process.env.KITCHEN_URL ||
    process.env.NEXT_PUBLIC_KITCHEN_SITE_URL ||
    "http://localhost:3001";
  let managerUrl =
    process.env.MANAGER_URL ||
    process.env.NEXT_PUBLIC_MANAGER_SITE_URL ||
    "http://localhost:3002";
  let demo = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--customer" || arg === "-c") {
      customerUrl = argv[++i];
    } else if (arg.startsWith("--customer=")) {
      customerUrl = arg.slice("--customer=".length);
    } else if (arg === "--kitchen" || arg === "-k") {
      kitchenUrl = argv[++i];
    } else if (arg.startsWith("--kitchen=")) {
      kitchenUrl = arg.slice("--kitchen=".length);
    } else if (arg === "--manager" || arg === "-m") {
      managerUrl = argv[++i];
    } else if (arg.startsWith("--manager=")) {
      managerUrl = arg.slice("--manager=".length);
    } else if (arg === "--demo" || arg === "--demo=true") {
      demo = true;
    }
  }

  return { customerUrl, kitchenUrl, managerUrl, demo };
}

export async function runCli(): Promise<void> {
  const config = parseCliArgs(process.argv.slice(2));

  console.log(`Connecting to sites:`);
  console.log(`  Customer: ${config.customerUrl}`);
  console.log(`  Kitchen:  ${config.kitchenUrl}`);
  console.log(`  Manager:  ${config.managerUrl}`);
  console.log(`  Demo:     ${config.demo ? "enabled (--demo)" : "disabled"}`);

  const summary = await runSmokeTests(config);
  console.log(formatSmokeResults(summary));

  if (!summary.passed) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/smoke.ts")) {
  runCli().catch((err) => {
    console.error("Fatal smoke test error:", err);
    process.exit(1);
  });
}
