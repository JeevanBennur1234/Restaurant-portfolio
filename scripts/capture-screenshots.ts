import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { chromium, expect, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { validateSafeE2EDatabaseUrl } from "../e2e/global-setup";

const CUSTOMER_PORT = 3000;
const KITCHEN_PORT = 3001;
const MANAGER_PORT = 3002;

const CUSTOMER_URL = `http://localhost:${CUSTOMER_PORT}`;
const KITCHEN_URL = `http://localhost:${KITCHEN_PORT}`;
const MANAGER_URL = `http://localhost:${MANAGER_PORT}`;

const FIXED_SESSION_SECRET = "e2e-fixed-test-session-secret-at-least-32-chars-long";
const FIXED_DEMO_RESET_SECRET = "e2e-demo-reset-secret-at-least-32-chars-long";

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots");

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: unknown) => {
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

function killProcessTree(pid?: number) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGKILL");
    }
  } catch {
    // Process already exited
  }
}

async function waitForHealth(url: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/v1/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // Continue polling
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for health endpoint: ${url}/api/v1/health`);
}

async function hideOverlays(page: Page) {
  await page.addStyleTag({
    content: `
      nextjs-portal,
      [data-nextjs-toast],
      #__next-build-watcher,
      [data-nextjs-dev-overlay] {
        display: none !important;
      }
    `,
  });
}

interface ScreenshotTask {
  filename: string;
  width: number;
  height: number;
  capture: (browser: Browser) => Promise<Buffer>;
}

export async function main() {
  console.log("\n========================================================");
  console.log("📸 DinePulse Portfolio Screenshot Capture Automation");
  console.log("========================================================\n");

  // 1. Mandatory Database Safety Check
  const rawDbUrl = process.env.E2E_DATABASE_URL;
  if (!rawDbUrl || !rawDbUrl.trim()) {
    console.error("🛑 SCREENSHOT CAPTURE ABORTED (DATABASE SAFETY REFUSAL)");
    console.error("Error: Missing required environment variable 'E2E_DATABASE_URL'.");
    console.error(
      "Screenshot capture strictly requires an explicit E2E_DATABASE_URL pointing to a disposable local PostgreSQL database.\n" +
        "Never run screenshot capture against a production or shared Supabase database."
    );
    process.exit(1);
  }

  const validation = validateSafeE2EDatabaseUrl(rawDbUrl);
  if (!validation.safe) {
    console.error("🛑 SCREENSHOT CAPTURE ABORTED (DATABASE SAFETY REFUSAL)");
    console.error(validation.reason);
    process.exit(1);
  }

  const cleanDbUrl = rawDbUrl.replace(/^["']|["']$/g, "").trim();
  console.log(`🔒 [Safety Verified] Safe local test database host: ${validation.host}`);

  // 2. Refuse pre-existing development servers whose database cannot be guaranteed
  for (const port of [CUSTOMER_PORT, KITCHEN_PORT, MANAGER_PORT]) {
    if (await isPortInUse(port)) {
      console.error("🛑 SCREENSHOT CAPTURE ABORTED (PORT CONFLICT)");
      console.error(
        `Error: Port ${port} is already in use.\n` +
          "Pre-existing development servers cannot be guaranteed to use the validated disposable local database.\n" +
          "Please terminate any active development servers on ports 3000, 3001, and 3002 before running screenshot capture."
      );
      process.exit(1);
    }
  }

  // 3. Process lifecycle handles for guaranteed cleanup in try/finally
  let wslKeepAlive: ChildProcess | null = null;
  const servers: ChildProcess[] = [];
  let browser: Browser | null = null;

  const cleanup = () => {
    console.log("\n🧹 Cleaning up child processes and servers...");
    for (const s of servers) {
      if (s.pid) killProcessTree(s.pid);
    }
    if (wslKeepAlive?.pid) {
      killProcessTree(wslKeepAlive.pid);
      wslKeepAlive = null;
    }
  };

  const sigHandler = () => {
    cleanup();
    process.exit(1);
  };
  process.on("SIGINT", sigHandler);
  process.on("SIGTERM", sigHandler);

  try {
    // Start WSL PostgreSQL if on Windows
    if (process.platform === "win32") {
      try {
        execSync("wsl -u root -d Ubuntu service postgresql start", { stdio: "ignore" });
        wslKeepAlive = spawn("wsl", ["-u", "root", "-d", "Ubuntu", "sleep", "infinity"], { stdio: "ignore" });
      } catch {
        // WSL not present or native Windows postgres
      }
    }

    console.log("\n📦 Applying migrations to disposable local database...");
    execSync("npx tsx src/server/db/migrate.ts", {
      env: {
        ...process.env,
        DATABASE_URL: cleanDbUrl,
        NODE_ENV: "development",
      },
      stdio: "inherit",
    });

    console.log("🌱 Seeding disposable local database (DEMO_MODE=true)...");
    execSync("npx tsx src/server/db/seed.ts", {
      env: {
        ...process.env,
        DATABASE_URL: cleanDbUrl,
        DEMO_MODE: "true",
        SEED_KITCHEN_PASSWORD: "kitchen123",
        SEED_MANAGER_PASSWORD: "manager123",
        NODE_ENV: "development",
      },
      stdio: "inherit",
    });

    // 4. Start Local Development Servers
    const commonEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "development",
      DEMO_MODE: "true",
      DATABASE_URL: cleanDbUrl,
      NEXT_PUBLIC_CUSTOMER_SITE_URL: CUSTOMER_URL,
      NEXT_PUBLIC_KITCHEN_SITE_URL: KITCHEN_URL,
      NEXT_PUBLIC_MANAGER_SITE_URL: MANAGER_URL,
      FRAME_ANCESTORS: CUSTOMER_URL,
      SESSION_SECRET: FIXED_SESSION_SECRET,
      DEMO_RESET_SECRET: FIXED_DEMO_RESET_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-role-key",
      RAZORPAY_KEY_ID: "rzp_test_placeholder_key",
      RAZORPAY_KEY_SECRET: "placeholder_secret",
    };

    console.log("🚀 Spawning 3 Next.js development servers...");
    const customerProc = spawn("npm", ["run", "dev:customer"], {
      env: {
        ...commonEnv,
        SITE: "customer",
        NEXT_PUBLIC_APP_URL: CUSTOMER_URL,
      },
      shell: true,
      stdio: "pipe",
    });
    servers.push(customerProc);

    const kitchenProc = spawn("npm", ["run", "dev:kitchen"], {
      env: {
        ...commonEnv,
        SITE: "kitchen",
        NEXT_PUBLIC_APP_URL: KITCHEN_URL,
      },
      shell: true,
      stdio: "pipe",
    });
    servers.push(kitchenProc);

    const managerProc = spawn("npm", ["run", "dev:manager"], {
      env: {
        ...commonEnv,
        SITE: "manager",
        NEXT_PUBLIC_APP_URL: MANAGER_URL,
      },
      shell: true,
      stdio: "pipe",
    });
    servers.push(managerProc);

    console.log("⏳ Waiting for all three health endpoints to become ready...");
    await Promise.all([
      waitForHealth(CUSTOMER_URL),
      waitForHealth(KITCHEN_URL),
      waitForHealth(MANAGER_URL),
    ]);
    console.log("✅ All three servers responded healthy.");

    // 5. Reset demo state via API
    console.log("🔄 Resetting demo dataset via POST /api/demo/reset...");
    const resetRes = await fetch(`${CUSTOMER_URL}/api/demo/reset`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FIXED_DEMO_RESET_SECRET}`,
      },
    });
    if (!resetRes.ok) {
      throw new Error(`Demo reset failed with status ${resetRes.status}`);
    }
    console.log("✅ Demo state reset successfully.");

    // 6. Pre-warm key Next.js routes to trigger on-demand compilation before browser automation
    console.log("🔥 Pre-warming Next.js routes...");
    await Promise.all([
      fetch(`${CUSTOMER_URL}/t/demo-table-7`).catch(() => {}),
      fetch(`${KITCHEN_URL}/kitchen`).catch(() => {}),
      fetch(`${MANAGER_URL}/admin`).catch(() => {}),
      fetch(`${CUSTOMER_URL}/demo`).catch(() => {}),
    ]);

    // 7. Launch browser to prepare realistic order workflow and capture views
    console.log("🌐 Launching Playwright Chromium for workflow execution...");
    browser = await chromium.launch({ headless: true });

    let trackedOrderUrl = "";
    let order3Number = "";

    // Step A: Customer places Order 3 on Table 7
    console.log("🛒 Preparing Order 3 via Guest Customer UI...");
    const guestContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`${CUSTOMER_URL}/t/demo-table-7`, { waitUntil: "networkidle" });
    await expect(guestPage).toHaveTitle(/Table 7/i, { timeout: 30_000 });

    const firstCard = guestPage.locator('[data-testid="menu-item-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 30_000 });
    await firstCard.click();

    const addBtn = guestPage.locator('[data-testid="add-to-order-btn"]');
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    const cartBtn = guestPage.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBtn).toBeVisible({ timeout: 10_000 });
    await cartBtn.click();

    const payCounter = guestPage.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounter).toBeVisible({ timeout: 10_000 });
    await payCounter.click();

    const checkoutBtn = guestPage.locator('[data-testid="checkout-submit-btn"]');
    await expect(checkoutBtn).toBeVisible({ timeout: 10_000 });
    await checkoutBtn.click();

    await guestPage.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });
    trackedOrderUrl = guestPage.url();
    const orderBadge = guestPage.locator('[data-testid="order-number-badge"]');
    await expect(orderBadge).toBeVisible({ timeout: 15_000 });
    order3Number = (await orderBadge.innerText()).replace("#", "").trim();
    console.log(`✅ Order 3 placed: #${order3Number} (${trackedOrderUrl})`);

    // Step B: Advance Order 3 in Kitchen and verify full transition pipeline
    console.log("🍳 Advancing Order 3 in Kitchen Board to 'Ready' and verifying state across all surfaces...");
    const kitchenContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const kitchenPage = await kitchenContext.newPage();
    await kitchenPage.goto(`${KITCHEN_URL}/kitchen`, { waitUntil: "networkidle" });
    const kDemoBtn = kitchenPage.locator('[data-testid="kitchen-demo-login-btn"]');
    if (await kDemoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await kDemoBtn.click();
    }
    await kitchenPage.locator("header").waitFor({ state: "visible", timeout: 30_000 });

    const ticket3 = kitchenPage.locator(
      `[data-testid="kitchen-ticket"]:has([data-testid="ticket-order-number"]:has-text("${order3Number}"))`
    );
    await expect(ticket3).toBeVisible({ timeout: 20_000 });
    const actionBtn3 = ticket3.locator('[data-testid="ticket-action-btn"]');

    // 1. Assert ticket is currently queued with 'Start Prep'
    await expect(actionBtn3).toContainText(/Start Prep/i, { timeout: 10_000 });

    // Transition 1: Placed -> Preparing
    // Wait for the backend transition endpoint to respond and guest tracker to update
    await Promise.all([
      kitchenPage.waitForResponse(
        (r) => r.url().includes("/transition") && r.status() === 200,
        { timeout: 15_000 }
      ),
      actionBtn3.click(),
    ]);

    // Verification 1: Kitchen ticket reaches 'Preparing' (action button changes to 'Mark Ready')
    await expect(actionBtn3).toContainText(/Mark Ready/i, { timeout: 15_000 });
    const guestStatusTitle = guestPage.locator('[data-testid="order-status-title"]');
    await expect(guestStatusTitle).toContainText(/Cooking in Sigdi & Tandoor/i, { timeout: 20_000 });
    console.log(`  [1/4 Verified] Kitchen ticket #${order3Number} reached 'Preparing' (confirmed by backend & guest tracker).`);

    // Transition 2: Preparing -> Ready
    await Promise.all([
      kitchenPage.waitForResponse(
        (r) => r.url().includes("/transition") && r.status() === 200,
        { timeout: 15_000 }
      ),
      actionBtn3.click(),
    ]);

    // Verification 2: The same kitchen ticket reaches 'Ready' (action button changes to 'Served / Dispatch')
    await expect(actionBtn3).toContainText(/Served \/ Dispatch/i, { timeout: 15_000 });
    const readySection = kitchenPage.locator('section:has(h2:has-text("Ready to Serve"))');
    await expect(
      readySection.locator(`[data-testid="kitchen-ticket"]:has-text("${order3Number}")`)
    ).toBeVisible({ timeout: 15_000 });
    console.log(`  [2/4 Verified] Kitchen ticket #${order3Number} reached 'Ready' in Ready to Serve column.`);

    // Verification 3: Guest tracker displays updated 'Ready' state ('Plated & Ready to Serve')
    await expect(guestStatusTitle).toContainText(/Plated & Ready to Serve/i, { timeout: 25_000 });
    console.log(`  [3/4 Verified] Guest live tracker reflects 'Plated & Ready to Serve'.`);

    // Verification 4: Manager orders view reflects the expected 'Ready' order state
    const managerContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const managerPage = await managerContext.newPage();
    await managerPage.goto(`${MANAGER_URL}/admin`, { waitUntil: "networkidle" });
    const mDemoBtn = managerPage.locator('[data-testid="admin-demo-login-btn"]');
    if (await mDemoBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await mDemoBtn.click();
    }
    const navOrders = managerPage.locator('[data-testid="admin-nav-orders"]');
    await navOrders.waitFor({ state: "visible", timeout: 30_000 });
    await navOrders.click();

    const order3Row = managerPage.locator(`tr:has-text("${order3Number}")`);
    await expect(order3Row).toBeVisible({ timeout: 15_000 });
    await expect(order3Row.locator("td").filter({ hasText: /^●? ?Ready$/ })).toBeVisible({ timeout: 15_000 });
    console.log(`  [4/4 Verified] Manager live orders view reflects 'Ready' status for #${order3Number}.`);
    console.log("🎯 All 4 order-state verifications successfully passed!\n");

    // Step C: Place Order 4 and cancel it via Manager Console for realistic audit views
    console.log("❌ Creating and cancelling Order 4 for manager audit records...");
    await guestPage.goto(`${CUSTOMER_URL}/t/demo-table-7`, { waitUntil: "networkidle" });
    const secondCard = guestPage.locator('[data-testid="menu-item-card"]').nth(1);
    await expect(secondCard).toBeVisible({ timeout: 15_000 });
    await secondCard.click();
    const addBtn2 = guestPage.locator('[data-testid="add-to-order-btn"]');
    await expect(addBtn2).toBeVisible({ timeout: 10_000 });
    await addBtn2.click();

    const cartBtn2 = guestPage.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBtn2).toBeVisible({ timeout: 10_000 });
    await cartBtn2.click();

    const payCounter2 = guestPage.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounter2).toBeVisible({ timeout: 10_000 });
    await payCounter2.click();

    const checkoutBtn2 = guestPage.locator('[data-testid="checkout-submit-btn"]');
    await expect(checkoutBtn2).toBeVisible({ timeout: 10_000 });
    await checkoutBtn2.click();

    await guestPage.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });
    const order4Badge = guestPage.locator('[data-testid="order-number-badge"]');
    await expect(order4Badge).toBeVisible({ timeout: 15_000 });
    const order4Number = (await order4Badge.innerText()).replace("#", "").trim();
    console.log(`✅ Order 4 placed: #${order4Number}.`);

    // Cancel Order 4 in Manager console
    await navOrders.click();
    const order4Row = managerPage.locator(`tr:has-text("${order4Number}")`);
    await expect(order4Row).toBeVisible({ timeout: 15_000 });
    const cancelBtn = order4Row.locator('[data-testid="cancel-order-btn"]');
    await expect(cancelBtn).toBeVisible({ timeout: 15_000 });
    await cancelBtn.click();

    const reasonInput = managerPage.locator('[data-testid="cancel-reason-input"]');
    await expect(reasonInput).toBeVisible({ timeout: 10_000 });
    await reasonInput.fill("Guest requested order cancellation");
    await managerPage.click('[data-testid="confirm-cancel-btn"]');

    await expect(order4Row.locator("td").filter({ hasText: /^●? ?Cancelled$/ })).toBeVisible({ timeout: 15_000 });
    console.log(`✅ Order #${order4Number} cancelled with audit reason in manager console.`);

    await guestContext.close();
    await kitchenContext.close();
    await managerContext.close();

    // Ensure screenshot directory exists
    if (!fs.existsSync(SCREENSHOT_DIR)) {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }

    // 8. Define 10 Screenshot Tasks
    const tasks: ScreenshotTask[] = [
      // 1. customer-menu.webp (390 x 844)
      {
        filename: "customer-menu.webp",
        width: 390,
        height: 844,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
          const p = await ctx.newPage();
          await p.goto(`${CUSTOMER_URL}/t/demo-table-7`, { waitUntil: "networkidle" });
          await p.locator('[data-testid="menu-item-card"]').first().waitFor({ state: "visible", timeout: 30_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 2. customer-cart.webp (390 x 844)
      {
        filename: "customer-cart.webp",
        width: 390,
        height: 844,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
          const p = await ctx.newPage();
          await p.goto(`${CUSTOMER_URL}/t/demo-table-7`, { waitUntil: "networkidle" });
          const item = p.locator('[data-testid="menu-item-card"]').first();
          await item.waitFor({ state: "visible", timeout: 30_000 });
          await item.click();
          await p.locator('[data-testid="add-to-order-btn"]').click();
          const cartBar = p.locator('[data-testid="cart-bar-btn"]');
          await cartBar.waitFor({ state: "visible", timeout: 10_000 });
          await cartBar.click();
          await p.locator('[data-testid="checkout-submit-btn"]').waitFor({ state: "visible", timeout: 10_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 3. customer-tracker.webp (390 x 844) - Verified in Ready state
      {
        filename: "customer-tracker.webp",
        width: 390,
        height: 844,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
          const p = await ctx.newPage();
          await p.goto(trackedOrderUrl || `${CUSTOMER_URL}/t/demo-table-7`, { waitUntil: "networkidle" });
          await p.locator('[data-testid="order-number-badge"]').waitFor({ state: "visible", timeout: 30_000 });
          const statusTitle = p.locator('[data-testid="order-status-title"]');
          await expect(statusTitle).toContainText(/Plated & Ready to Serve/i, { timeout: 15_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 4. customer-landing.webp (1440 x 900)
      {
        filename: "customer-landing.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${CUSTOMER_URL}/`, { waitUntil: "networkidle" });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 5. kitchen-board.webp (1280 x 800) - Verified with ticket in Ready column
      {
        filename: "kitchen-board.webp",
        width: 1280,
        height: 800,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
          const p = await ctx.newPage();
          await p.goto(`${KITCHEN_URL}/kitchen`, { waitUntil: "networkidle" });
          const btn = p.locator('[data-testid="kitchen-demo-login-btn"]');
          if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await btn.click();
          }
          await p.locator('[data-testid="kitchen-ticket"]').first().waitFor({ state: "visible", timeout: 30_000 });
          const readyCol = p.locator('section:has(h2:has-text("Ready to Serve"))');
          await expect(readyCol.locator(`[data-testid="kitchen-ticket"]:has-text("${order3Number}")`)).toBeVisible({
            timeout: 15_000,
          });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 6. manager-orders.webp (1440 x 900) - Verified with Ready and Cancelled rows
      {
        filename: "manager-orders.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${MANAGER_URL}/admin`, { waitUntil: "networkidle" });
          const btn = p.locator('[data-testid="admin-demo-login-btn"]');
          if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await btn.click();
          }
          const nav = p.locator('[data-testid="admin-nav-orders"]');
          await nav.waitFor({ state: "visible", timeout: 30_000 });
          await nav.click();
          await expect(p.locator("tr", { hasText: "Cancelled" }).first()).toBeVisible({ timeout: 15_000 });
          await expect(p.locator("tr", { hasText: "Ready" }).first()).toBeVisible({ timeout: 15_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 7. manager-menu.webp (1440 x 900)
      {
        filename: "manager-menu.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${MANAGER_URL}/admin`, { waitUntil: "networkidle" });
          const btn = p.locator('[data-testid="admin-demo-login-btn"]');
          if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await btn.click();
          }
          const nav = p.locator('[data-testid="admin-nav-menu"]');
          await nav.waitFor({ state: "visible", timeout: 30_000 });
          await nav.click();
          await p.locator('[data-testid="add-item-btn"]').waitFor({ state: "visible", timeout: 15_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 8. manager-tables.webp (1440 x 900)
      {
        filename: "manager-tables.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${MANAGER_URL}/admin`, { waitUntil: "networkidle" });
          const btn = p.locator('[data-testid="admin-demo-login-btn"]');
          if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await btn.click();
          }
          const nav = p.locator('[data-testid="admin-nav-tables"]');
          await nav.waitFor({ state: "visible", timeout: 30_000 });
          await nav.click();
          await p.locator('[data-testid="download-qr-pdf-btn"]').waitFor({ state: "visible", timeout: 15_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 9. manager-reports.webp (1440 x 900)
      {
        filename: "manager-reports.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${MANAGER_URL}/admin`, { waitUntil: "networkidle" });
          const btn = p.locator('[data-testid="admin-demo-login-btn"]');
          if (await btn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await btn.click();
          }
          const nav = p.locator('[data-testid="admin-nav-reports"]');
          await nav.waitFor({ state: "visible", timeout: 30_000 });
          await nav.click();
          await p
            .getByText(/Sales & Operational Analytics|Sales & Performance Insights|Gross Revenue|Net Sales/i)
            .first()
            .waitFor({ state: "visible", timeout: 15_000 });
          await p.waitForTimeout(500);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
      // 10. demo-page.webp (1440 x 900) - Honest capture of real dual-pane showcase UI
      {
        filename: "demo-page.webp",
        width: 1440,
        height: 900,
        capture: async (b) => {
          const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
          const p = await ctx.newPage();
          await p.goto(`${CUSTOMER_URL}/demo`, { waitUntil: "networkidle" });
          await p.locator("iframe").first().waitFor({ state: "attached", timeout: 30_000 });
          await p.waitForTimeout(2000);
          await hideOverlays(p);
          const buf = await p.screenshot({ type: "png" });
          await ctx.close();
          return buf;
        },
      },
    ];

    console.log(`\n📸 Capturing and optimizing ${tasks.length} WebP screenshots...`);
    const manifest: Array<{
      filename: string;
      dimensions: string;
      bytes: number;
      kb: string;
    }> = [];

    let totalBytes = 0;

    for (const t of tasks) {
      process.stdout.write(`  Capturing ${t.filename} (${t.width}x${t.height})... `);
      const pngBuf = await t.capture(browser);

      const targetFile = path.join(SCREENSHOT_DIR, t.filename);

      // Convert to optimized WebP at quality 82, ensuring width <= 1600
      await sharp(pngBuf)
        .resize({ width: t.width, height: t.height, fit: "inside" })
        .webp({ quality: 82, effort: 6 })
        .toFile(targetFile);

      const stat = fs.statSync(targetFile);
      const meta = await sharp(targetFile).metadata();

      if (meta.format !== "webp") {
        throw new Error(`Captured image ${t.filename} is not in webp format`);
      }
      if (stat.size === 0) {
        throw new Error(`Captured image ${t.filename} is empty (0 bytes)`);
      }

      totalBytes += stat.size;
      manifest.push({
        filename: t.filename,
        dimensions: `${meta.width} × ${meta.height}`,
        bytes: stat.size,
        kb: `${(stat.size / 1024).toFixed(1)} KB`,
      });

      console.log(`✅ ${(stat.size / 1024).toFixed(1)} KB`);
    }

    console.log("\n========================================================");
    console.log("📊 Screenshot Capture Manifest");
    console.log("========================================================");
    console.table(manifest);

    const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
    console.log(`Combined Total Size: ${totalBytes} bytes (~${totalMb} MB)`);

    const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
    if (totalBytes >= MAX_TOTAL_BYTES) {
      throw new Error(
        `Aggregate image size ${totalBytes} bytes (${totalMb} MB) exceeds maximum permitted limit of 2 MB.`
      );
    }

    console.log(`✅ Verification passed: all 10 WebP screenshots generated (< 2 MB budget).`);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Browser already closed
      }
    }
    cleanup();
    process.removeListener("SIGINT", sigHandler);
    process.removeListener("SIGTERM", sigHandler);
  }
}

if (require.main === module || process.argv[1]?.includes("capture-screenshots")) {
  main().catch((err) => {
    console.error("\n❌ Screenshot capture failed:", err);
    process.exit(1);
  });
}
