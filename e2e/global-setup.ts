import { execSync } from "node:child_process";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

export function validateSafeE2EDatabaseUrl(rawUrl?: string): {
  safe: boolean;
  host: string;
  reason?: string;
} {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      safe: false,
      host: "",
      reason: "Neither E2E_DATABASE_URL nor DATABASE_URL is configured.",
    };
  }

  const clean = rawUrl.replace(/^["']|["']$/g, "").trim();
  let host = "";

  try {
    const parsed = new URL(clean);
    host = parsed.hostname.toLowerCase();
  } catch {
    const match = clean.match(/@([^:/]+)/);
    host = match ? match[1].toLowerCase() : "";
  }

  if (host.includes("supabase")) {
    return {
      safe: false,
      host,
      reason: `E2E Safety Refusal: Database host "${host}" contains "supabase". E2E tests wipe and re-seed data and are strictly prohibited from connecting to Supabase instances.`,
    };
  }

  const allowedHosts = ["localhost", "127.0.0.1", "::1", "postgres", "0.0.0.0"];
  const isAllowed =
    allowedHosts.includes(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal");

  if (!isAllowed) {
    return {
      safe: false,
      host,
      reason: `E2E Safety Refusal: Database host "${host}" is not recognized as a safe local or CI Postgres host. Allowed hosts: ${allowedHosts.join(", ")}.`,
    };
  }

  return { safe: true, host };
}

export default async function globalSetup() {
  const dbUrl =
    process.env.E2E_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

  const validation = validateSafeE2EDatabaseUrl(dbUrl);

  if (!validation.safe) {
    console.error("\n========================================================");
    console.error("🛑 E2E GLOBAL SETUP ABORTED (SAFETY CHECK)");
    console.error(validation.reason);
    console.error("========================================================\n");
    throw new Error(validation.reason);
  }

  const safeE2EDefaults: Record<string, string> = {
    APP_URL: "http://localhost:3000",
    SESSION_SECRET: "e2e-fixed-test-session-secret-at-least-32-chars-long",
    PAYMENTS_MODE: "online",
    NEXT_PUBLIC_CUSTOMER_SITE_URL: "http://localhost:3000",
    NEXT_PUBLIC_KITCHEN_SITE_URL: "http://localhost:3001",
    NEXT_PUBLIC_MANAGER_SITE_URL: "http://localhost:3002",
    FRAME_ANCESTORS: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://mock-ci-project.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-build-supabase-anon-key-token",
    SUPABASE_SERVICE_ROLE_KEY: "ci-build-supabase-service-role-token",
    RAZORPAY_KEY_ID: "rzp_test_e2e_test_key",
    RAZORPAY_KEY_SECRET: "e2e_test_secret_32_characters_long",
    RAZORPAY_WEBHOOK_SECRET: "e2e_test_webhook_secret_32_chars",
    DEV_TABLE_TOKEN: "demo-table-7",
    ENABLE_DEV_TABLE_LAUNCHER: "true",
    ALLOW_TEST_PAYMENT_SIMULATION: "true",
  };

  for (const [key, value] of Object.entries(safeE2EDefaults)) {
    if (
      process.env[key] === undefined ||
      process.env[key]?.toLowerCase().includes("placeholder")
    ) {
      process.env[key] = value;
    }
  }

  console.log(`\n🔒 [E2E Safety] Verified safe database host: ${validation.host}`);
  console.log("📦 [E2E Setup] Applying database migrations to local test database...");

  const cleanDbUrl = dbUrl.replace(/^["']|["']$/g, "").trim();

  execSync("npx tsx src/server/db/migrate.ts", {
    env: {
      ...process.env,
      DATABASE_URL: cleanDbUrl,
      NODE_ENV: "development",
    },
    stdio: "inherit",
  });

  console.log("🌱 [E2E Setup] Seeding test database...");
  execSync("npx tsx src/server/db/seed.ts", {
    env: {
      ...process.env,
      DATABASE_URL: cleanDbUrl,
      SEED_KITCHEN_PASSWORD: "kitchen123",
      SEED_MANAGER_PASSWORD: "manager123",
      NODE_ENV: "development",
    },
    stdio: "inherit",
  });

  console.log("✅ [E2E Setup] Database migrations and initial seed completed successfully.\n");
}
