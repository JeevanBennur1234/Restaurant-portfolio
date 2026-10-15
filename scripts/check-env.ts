import * as crypto from "node:crypto";
import * as dotenv from "dotenv";
import { validateFrameAncestors, validateSiteUrlOrigin } from "../src/server/env";

// Ensure .env.local and .env are loaded
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export type TargetSite = "customer" | "kitchen" | "manager" | "all";

export interface CheckEnvItem {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  message: string;
}

export interface CheckEnvResult {
  site: TargetSite;
  items: CheckEnvItem[];
  passed: boolean;
  hasWarnings: boolean;
  secretHash?: string;
}

export interface ValidateEnvOptions {
  site: TargetSite;
  expectSecretHash?: string;
  isProduction?: boolean;
}

const OLD_DEFAULT_SESSION_SECRET = "dinepulse_super_secret_staff_session_key_2026";

function isPlaceholder(val: string | undefined): boolean {
  if (!val) return false;
  const lower = val.toLowerCase();
  return (
    lower.includes("placeholder") ||
    lower.includes("change-me") ||
    lower.includes("replace-this") ||
    val.startsWith("generate-with:") ||
    val === OLD_DEFAULT_SESSION_SECRET
  );
}

/**
 * Extracts registrable domain from hostname.
 * Treats vercel.app as a multi-tenant public suffix (a.vercel.app != b.vercel.app).
 */
export function getRegistrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().split(":")[0].trim();
  if (host === "localhost" || host === "127.0.0.1") return host;

  // vercel.app is a public multi-tenant suffix where each app is an independent domain
  if (host.endsWith(".vercel.app")) {
    return host;
  }

  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const commonTwoPartTlds = new Set([
    "co.uk", "org.uk", "gov.uk", "ac.uk",
    "co.in", "net.in", "org.in", "gov.in",
    "com.au", "net.au", "org.au",
    "co.nz", "com.br", "co.jp"
  ]);

  const lastTwo = parts.slice(-2).join(".");
  if (commonTwoPartTlds.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }

  return parts.slice(-2).join(".");
}

export function validateEnvForSite(
  env: Record<string, string | undefined>,
  options: ValidateEnvOptions
): CheckEnvResult {
  const { site, expectSecretHash } = options;
  const isProduction =
    options.isProduction ??
    (env.NODE_ENV === "production" || process.env.NODE_ENV === "production");

  const items: CheckEnvItem[] = [];

  // 1. SITE check: must equal the requested --site value
  const currentSite = env.SITE;
  if (!currentSite) {
    items.push({
      name: "SITE",
      status: "FAIL",
      message: `Missing SITE env var. Must equal "${site}".`,
    });
  } else if (currentSite !== site) {
    items.push({
      name: "SITE",
      status: "FAIL",
      message: `SITE="${currentSite}" does not match target site "${site}".`,
    });
  } else {
    items.push({
      name: "SITE",
      status: "PASS",
      message: `Matches target site "${site}".`,
    });
  }

  // 2. DATABASE_URL
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === "") {
    items.push({
      name: "DATABASE_URL",
      status: "FAIL",
      message: "DATABASE_URL is required.",
    });
  } else if (isPlaceholder(dbUrl)) {
    items.push({
      name: "DATABASE_URL",
      status: "FAIL",
      message: "DATABASE_URL contains placeholder value.",
    });
  } else if (!dbUrl.startsWith("postgres://") && !dbUrl.startsWith("postgresql://")) {
    items.push({
      name: "DATABASE_URL",
      status: "FAIL",
      message: "DATABASE_URL must start with postgres:// or postgresql://.",
    });
  } else {
    items.push({
      name: "DATABASE_URL",
      status: "PASS",
      message: "PostgreSQL connection string configured.",
    });
  }

  // 3. SESSION_SECRET (>= 32 chars, not a placeholder)
  const sessionSecret = env.SESSION_SECRET;
  let secretHash: string | undefined;

  if (!sessionSecret || sessionSecret.trim() === "") {
    items.push({
      name: "SESSION_SECRET",
      status: "FAIL",
      message: "SESSION_SECRET is required.",
    });
  } else {
    secretHash = crypto.createHash("sha256").update(sessionSecret).digest("hex");

    if (sessionSecret.length < 32) {
      items.push({
        name: "SESSION_SECRET",
        status: "FAIL",
        message: `SESSION_SECRET must be at least 32 characters long (length: ${sessionSecret.length}).`,
      });
    } else if (isPlaceholder(sessionSecret)) {
      items.push({
        name: "SESSION_SECRET",
        status: "FAIL",
        message: "SESSION_SECRET must not be a placeholder or default secret.",
      });
    } else {
      items.push({
        name: "SESSION_SECRET",
        status: "PASS",
        message: `Valid secret (length: ${sessionSecret.length}, sha256: ${secretHash.slice(0, 8)}...).`,
      });
    }

    // Compare with expected secret hash if provided
    if (expectSecretHash) {
      if (secretHash.toLowerCase() !== expectSecretHash.toLowerCase()) {
        items.push({
          name: "SESSION_SECRET_HASH",
          status: "WARN",
          message: `Secret hash (${secretHash.slice(0, 12)}...) differs from expected (${expectSecretHash.slice(0, 12)}...). All three sites must share the same secret.`,
        });
      } else {
        items.push({
          name: "SESSION_SECRET_HASH",
          status: "PASS",
          message: `Secret hash matches expected hash (${expectSecretHash.slice(0, 12)}...).`,
        });
      }
    }
  }

  // 4. NEXT_PUBLIC_APP_URL
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || appUrl.trim() === "") {
    items.push({
      name: "NEXT_PUBLIC_APP_URL",
      status: "FAIL",
      message: "NEXT_PUBLIC_APP_URL is required.",
    });
  } else {
    const valRes = validateSiteUrlOrigin(appUrl);
    if (!valRes.valid) {
      items.push({
        name: "NEXT_PUBLIC_APP_URL",
        status: "FAIL",
        message: valRes.error ?? "Invalid absolute origin URL without path.",
      });
    } else {
      items.push({
        name: "NEXT_PUBLIC_APP_URL",
        status: "PASS",
        message: valRes.origin ?? appUrl,
      });
    }
  }

  // 5. NEXT_PUBLIC_SUPABASE_URL
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || supabaseUrl.trim() === "") {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_URL",
      status: "FAIL",
      message: "NEXT_PUBLIC_SUPABASE_URL is required.",
    });
  } else if (isPlaceholder(supabaseUrl)) {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_URL",
      status: "FAIL",
      message: "NEXT_PUBLIC_SUPABASE_URL contains placeholder value.",
    });
  } else {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_URL",
      status: "PASS",
      message: "Configured.",
    });
  }

  // 6. NEXT_PUBLIC_SUPABASE_ANON_KEY
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey || anonKey.trim() === "") {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "FAIL",
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY is required.",
    });
  } else if (isPlaceholder(anonKey)) {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "FAIL",
      message: "NEXT_PUBLIC_SUPABASE_ANON_KEY contains placeholder value.",
    });
  } else {
    items.push({
      name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      status: "PASS",
      message: "Configured.",
    });
  }

  // 7. SUPABASE_SERVICE_ROLE_KEY
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || serviceKey.trim() === "") {
    items.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      status: "FAIL",
      message: "SUPABASE_SERVICE_ROLE_KEY is required.",
    });
  } else if (isPlaceholder(serviceKey)) {
    items.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      status: "FAIL",
      message: "SUPABASE_SERVICE_ROLE_KEY contains placeholder value.",
    });
  } else {
    items.push({
      name: "SUPABASE_SERVICE_ROLE_KEY",
      status: "PASS",
      message: "Configured.",
    });
  }

  // 8. Site-specific rules
  const isDemo = env.DEMO_MODE === "true";

  if (site === "customer" || site === "all") {
    if (!isDemo) {
      // Real payment keys required
      const razorpayFields: Array<[string, string | undefined]> = [
        ["RAZORPAY_KEY_ID", env.RAZORPAY_KEY_ID],
        ["RAZORPAY_KEY_SECRET", env.RAZORPAY_KEY_SECRET],
        ["RAZORPAY_WEBHOOK_SECRET", env.RAZORPAY_WEBHOOK_SECRET],
      ];

      for (const [keyName, val] of razorpayFields) {
        if (!val || val.trim() === "") {
          items.push({
            name: keyName,
            status: "FAIL",
            message: `${keyName} is required when DEMO_MODE is not "true".`,
          });
        } else if (isPlaceholder(val)) {
          items.push({
            name: keyName,
            status: "FAIL",
            message: `${keyName} contains placeholder value.`,
          });
        } else {
          items.push({
            name: keyName,
            status: "PASS",
            message: "Configured for live payment processing.",
          });
        }
      }
    } else {
      // DEMO_MODE = true
      const demoResetSecret = env.DEMO_RESET_SECRET;
      if (!demoResetSecret || demoResetSecret.trim() === "") {
        items.push({
          name: "DEMO_RESET_SECRET",
          status: "FAIL",
          message: "DEMO_RESET_SECRET is required when DEMO_MODE is true.",
        });
      } else if (isPlaceholder(demoResetSecret)) {
        items.push({
          name: "DEMO_RESET_SECRET",
          status: "FAIL",
          message: "DEMO_RESET_SECRET must not be a placeholder.",
        });
      } else {
        items.push({
          name: "DEMO_RESET_SECRET",
          status: "PASS",
          message: "Configured.",
        });
      }

      // Customer site demo links to kitchen and manager
      const kitchenUrl = env.NEXT_PUBLIC_KITCHEN_SITE_URL;
      const managerUrl = env.NEXT_PUBLIC_MANAGER_SITE_URL;

      if (!kitchenUrl || kitchenUrl.trim() === "") {
        items.push({
          name: "NEXT_PUBLIC_KITCHEN_SITE_URL",
          status: "FAIL",
          message: "NEXT_PUBLIC_KITCHEN_SITE_URL is required on customer site when DEMO_MODE is true.",
        });
      } else {
        const valRes = validateSiteUrlOrigin(kitchenUrl);
        if (!valRes.valid) {
          items.push({
            name: "NEXT_PUBLIC_KITCHEN_SITE_URL",
            status: "FAIL",
            message: valRes.error ?? "Invalid kitchen site URL origin.",
          });
        } else {
          items.push({
            name: "NEXT_PUBLIC_KITCHEN_SITE_URL",
            status: "PASS",
            message: valRes.origin ?? kitchenUrl,
          });
        }
      }

      if (!managerUrl || managerUrl.trim() === "") {
        items.push({
          name: "NEXT_PUBLIC_MANAGER_SITE_URL",
          status: "FAIL",
          message: "NEXT_PUBLIC_MANAGER_SITE_URL is required on customer site when DEMO_MODE is true.",
        });
      } else {
        const valRes = validateSiteUrlOrigin(managerUrl);
        if (!valRes.valid) {
          items.push({
            name: "NEXT_PUBLIC_MANAGER_SITE_URL",
            status: "FAIL",
            message: valRes.error ?? "Invalid manager site URL origin.",
          });
        } else {
          items.push({
            name: "NEXT_PUBLIC_MANAGER_SITE_URL",
            status: "PASS",
            message: valRes.origin ?? managerUrl,
          });
        }
      }
    }
  }

  if (site === "kitchen" || site === "manager") {
    if (isDemo) {
      const frameAncestorsRaw = env.FRAME_ANCESTORS;
      const customerOrigin =
        env.NEXT_PUBLIC_CUSTOMER_SITE_URL ||
        env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

      let customerOriginNormalized = customerOrigin;
      try {
        customerOriginNormalized = new URL(customerOrigin).origin;
      } catch {}

      if (!frameAncestorsRaw || frameAncestorsRaw.trim() === "") {
        items.push({
          name: "FRAME_ANCESTORS",
          status: "FAIL",
          message: `FRAME_ANCESTORS must include the customer origin ("${customerOriginNormalized}") when DEMO_MODE is true.`,
        });
      } else {
        const parsed = validateFrameAncestors(frameAncestorsRaw, isProduction);
        if (!parsed.valid) {
          items.push({
            name: "FRAME_ANCESTORS",
            status: "FAIL",
            message: parsed.error ?? "Invalid FRAME_ANCESTORS configuration.",
          });
        } else if (!parsed.origins.includes(customerOriginNormalized)) {
          items.push({
            name: "FRAME_ANCESTORS",
            status: "FAIL",
            message: `FRAME_ANCESTORS must include the customer origin ("${customerOriginNormalized}") for demo iframes. Currently configured: ${parsed.origins.join(", ")}.`,
          });
        } else {
          items.push({
            name: "FRAME_ANCESTORS",
            status: "PASS",
            message: `Includes customer origin ("${customerOriginNormalized}").`,
          });
        }
      }
    }
  }

  // 9. Subdomain check (warn, not fail) if all three site URLs are configured
  const custUrl = env.NEXT_PUBLIC_CUSTOMER_SITE_URL || (site === "customer" ? env.NEXT_PUBLIC_APP_URL : undefined);
  const kitchUrl = env.NEXT_PUBLIC_KITCHEN_SITE_URL || (site === "kitchen" ? env.NEXT_PUBLIC_APP_URL : undefined);
  const mgrUrl = env.NEXT_PUBLIC_MANAGER_SITE_URL || (site === "manager" ? env.NEXT_PUBLIC_APP_URL : undefined);

  if (custUrl && kitchUrl && mgrUrl) {
    try {
      const custHost = new URL(custUrl).hostname;
      const kitchHost = new URL(kitchUrl).hostname;
      const mgrHost = new URL(mgrUrl).hostname;

      const custDom = getRegistrableDomain(custHost);
      const kitchDom = getRegistrableDomain(kitchHost);
      const mgrDom = getRegistrableDomain(mgrHost);

      const allMatch = custDom === kitchDom && kitchDom === mgrDom;

      if (!allMatch) {
        items.push({
          name: "CROSS_SITE_DOMAINS",
          status: "WARN",
          message: `Site URLs are not subdomains of the same registrable domain (customer: "${custDom}", kitchen: "${kitchDom}", manager: "${mgrDom}"). Cross-site demo iframes will fail due to third-party cookie restrictions.`,
        });
      } else {
        items.push({
          name: "CROSS_SITE_DOMAINS",
          status: "PASS",
          message: `All site URLs are subdomains of "${custDom}".`,
        });
      }
    } catch {
      items.push({
        name: "CROSS_SITE_DOMAINS",
        status: "WARN",
        message: "Unable to parse all three site URLs for domain alignment check.",
      });
    }
  }

  const passed = items.every((item) => item.status !== "FAIL");
  const hasWarnings = items.some((item) => item.status === "WARN");

  return {
    site,
    items,
    passed,
    hasWarnings,
    secretHash,
  };
}

export function formatResultTable(result: CheckEnvResult): string {
  const lines: string[] = [];
  lines.push(`\n🔍 DinePulse Environment Audit — Target Site: [${result.site.toUpperCase()}]`);
  lines.push("─".repeat(88));
  lines.push(
    `${"Variable".padEnd(30)} ${"Status".padEnd(8)} Details`
  );
  lines.push("─".repeat(88));

  for (const item of result.items) {
    const symbol = item.status === "PASS" ? "✅ PASS" : item.status === "WARN" ? "⚠️  WARN" : "❌ FAIL";
    lines.push(
      `${item.name.padEnd(30)} ${symbol.padEnd(8)} ${item.message}`
    );
  }

  lines.push("─".repeat(88));

  const passCount = result.items.filter((i) => i.status === "PASS").length;
  const failCount = result.items.filter((i) => i.status === "FAIL").length;
  const warnCount = result.items.filter((i) => i.status === "WARN").length;

  lines.push(
    `Summary: ${passCount} passed, ${failCount} failed, ${warnCount} warnings.`
  );

  if (result.passed) {
    lines.push(`✨ Result: PASS — Environment is valid for site "${result.site}".\n`);
  } else {
    lines.push(`💥 Result: FAIL — Fix the failed variables above before deploying.\n`);
  }

  return lines.join("\n");
}

function parseCliArgs(argv: string[]): {
  site: TargetSite;
  expectSecretHash?: string;
  printSecretHash: boolean;
} {
  let site: TargetSite = (process.env.SITE as TargetSite) || "all";
  let expectSecretHash: string | undefined;
  let printSecretHash = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--site" || arg === "-s") {
      const val = argv[++i] as TargetSite;
      if (["customer", "kitchen", "manager", "all"].includes(val)) {
        site = val;
      } else {
        console.error(`❌ Invalid --site: "${val}". Must be customer | kitchen | manager | all.`);
        process.exit(1);
      }
    } else if (arg.startsWith("--site=")) {
      const val = arg.slice("--site=".length) as TargetSite;
      if (["customer", "kitchen", "manager", "all"].includes(val)) {
        site = val;
      } else {
        console.error(`❌ Invalid --site: "${val}". Must be customer | kitchen | manager | all.`);
        process.exit(1);
      }
    } else if (arg === "--expect-secret-hash") {
      expectSecretHash = argv[++i];
    } else if (arg.startsWith("--expect-secret-hash=")) {
      expectSecretHash = arg.slice("--expect-secret-hash=".length);
    } else if (arg === "--print-secret-hash") {
      printSecretHash = true;
    } else if (["customer", "kitchen", "manager", "all"].includes(arg)) {
      site = arg as TargetSite;
    }
  }

  return { site, expectSecretHash, printSecretHash };
}

export function runCli(): void {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.printSecretHash) {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      console.error("❌ SESSION_SECRET is not set in environment.");
      process.exit(1);
    }
    const hash = crypto.createHash("sha256").update(secret).digest("hex");
    console.log(`SESSION_SECRET SHA-256 Hash: ${hash}`);
    return;
  }

  const result = validateEnvForSite(process.env as Record<string, string | undefined>, {
    site: args.site,
    expectSecretHash: args.expectSecretHash,
  });

  console.log(formatResultTable(result));

  if (!result.passed) {
    process.exit(1);
  }
}

// Auto-run if executed directly
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/check-env.ts")) {
  runCli();
}
