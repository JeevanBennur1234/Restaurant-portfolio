import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { chromium } from "@playwright/test";

const TABLE_TOKEN = "da7a9437e11a3995dabc2af5d0dc998a";
const PORT = 3000;
const URL = `http://localhost:${PORT}/t/${TABLE_TOKEN}`;

const OUTPUT_DIR = path.resolve(process.cwd(), "docs/screenshots");
const ARTIFACT_DIR = "C:/Users/bennu/.gemini/antigravity-cli/brain/73457cc1-5f8d-48b3-8fcc-c83cdd1e2b9b/screenshots";

async function waitForServer(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${PORT}`);
      if (res.status < 500) return true;
    } catch {
      // Keep waiting
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  return false;
}

async function main() {
  console.log("🎬 Starting Customer Next.js server on port 3000...");
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SITE: "customer",
    NODE_ENV: "production",
    PAYMENTS_MODE: "counter_only",
    PORT: String(PORT),
    DATABASE_SSL_REJECT_UNAUTHORIZED: "false",
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
  };

  const server: ChildProcess = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "start"],
    {
      env,
      stdio: "pipe",
      shell: true,
    }
  );

  server.stdout?.on("data", (d) => console.log(`[Next.js] ${d.toString().trim()}`));
  server.stderr?.on("data", (d) => console.error(`[Next.js Error] ${d.toString().trim()}`));

  try {
    const ready = await waitForServer(45000);
    if (!ready) {
      throw new Error("Server failed to respond on port 3000 within 45s");
    }
    console.log(`✅ Server ready on http://localhost:${PORT}`);

    const browser = await chromium.launch({ headless: true });

    const viewports = [
      { name: "360", width: 360, height: 780, isMobile: true },
      { name: "768", width: 768, height: 1024, isMobile: false },
      { name: "1280", width: 1280, height: 850, isMobile: false },
    ];

    for (const vp of viewports) {
      console.log(`📸 Capturing ${vp.name}px viewport (${vp.width}x${vp.height})...`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        deviceScaleFactor: 2,
      });

      const page = await context.newPage();
      await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for lane rail and cards to render
      await page.waitForSelector('[data-testid="menu-item-card"]', { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 1200));

      const screenshotFile = `masala-lane-menu-${vp.name}.png`;
      const docsPath = path.join(OUTPUT_DIR, screenshotFile);
      const artifactPath = path.join(ARTIFACT_DIR, screenshotFile);

      await page.screenshot({ path: docsPath, fullPage: false });
      fs.copyFileSync(docsPath, artifactPath);

      console.log(`  -> Saved ${docsPath}`);
      console.log(`  -> Copied to artifact ${artifactPath}`);

      await context.close();
    }

    await browser.close();
    console.log("\n🎉 All screenshots captured successfully!");
  } finally {
    console.log("🛑 Stopping server...");
    if (server.pid) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { stdio: "ignore" });
      } else {
        server.kill("SIGKILL");
      }
    }
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
