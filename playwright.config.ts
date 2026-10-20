import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

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

const dbUrl =
  process.env.E2E_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

const commonEnv = {
  NODE_ENV: "development",
  PAYMENTS_MODE: "online",
  DATABASE_URL: dbUrl,
  NEXT_PUBLIC_CUSTOMER_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_KITCHEN_SITE_URL: "http://localhost:3001",
  NEXT_PUBLIC_MANAGER_SITE_URL: "http://localhost:3002",
  FRAME_ANCESTORS: "http://localhost:3000",
  SESSION_SECRET: "e2e-fixed-test-session-secret-at-least-32-chars-long",
  NEXT_PUBLIC_SUPABASE_URL: "https://mock-ci-project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-build-supabase-anon-key-token",
  SUPABASE_SERVICE_ROLE_KEY: "ci-build-supabase-service-role-token",
  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID || "rzp_test_e2e_test_key",
  RAZORPAY_KEY_SECRET:
    process.env.RAZORPAY_KEY_SECRET || "e2e_test_secret_32_characters_long",
  RAZORPAY_WEBHOOK_SECRET:
    process.env.RAZORPAY_WEBHOOK_SECRET || "e2e_test_webhook_secret_32_chars",
  DEV_TABLE_TOKEN: "demo-table-7",
  ENABLE_DEV_TABLE_LAUNCHER: "true",
  ALLOW_TEST_PAYMENT_SIMULATION: "true",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // run specs serially to avoid database collision during demo resets
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
  webServer: [
    {
      command: "npm run dev:customer",
      url: "http://localhost:3000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        ...commonEnv,
        SITE: "customer",
        APP_URL: "http://localhost:3000",
      },
    },
    {
      command: "npm run dev:kitchen",
      url: "http://localhost:3001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        ...commonEnv,
        SITE: "kitchen",
        APP_URL: "http://localhost:3001",
      },
    },
    {
      command: "npm run dev:manager",
      url: "http://localhost:3002/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        ...commonEnv,
        SITE: "manager",
        APP_URL: "http://localhost:3002",
      },
    },
  ],
});
