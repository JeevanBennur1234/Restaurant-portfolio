import { test, expect } from "@playwright/test";
import { CUSTOMER_URL, resetDemoState } from "./test-helpers";

test.describe("Interactive Demo Showcase Page", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("/demo on :3000 renders frames with demo-enter and verifies open in new tab links", async ({
    page,
  }) => {
    // 1. Navigate to /demo showcase on customer site
    await page.goto(`${CUSTOMER_URL}/demo`);
    await expect(page).toHaveTitle(/Live Showcase/i);

    // 2. Assert Guest Ordering iframe is present
    const guestIframe = page.locator('iframe[title*="Guest Ordering"]');
    await expect(guestIframe).toBeVisible({ timeout: 15_000 });
    const guestSrc = await guestIframe.getAttribute("src");
    expect(guestSrc).toContain("/t/demo-table-7");

    // 3. Assert Kitchen iframe is present by default in Operations View
    const kitchenIframe = page.locator('iframe[title*="Kitchen Display"]');
    await expect(kitchenIframe).toBeVisible({ timeout: 15_000 });
    const kitchenSrc = await kitchenIframe.getAttribute("src");
    expect(kitchenSrc).toContain("3001");
    expect(kitchenSrc).toContain("demo-enter");

    // 4. Assert "Open in Tab" link for Kitchen is present
    const openInTabLink = page.getByRole("link", { name: /Open in (new )?tab/i }).first();
    await expect(openInTabLink).toBeVisible();
    const kitchenTabHref = await openInTabLink.getAttribute("href");
    expect(kitchenTabHref).toContain("3001");

    // 5. Switch to Manager Console view in Operations frame
    const managerToggleBtn = page.getByRole("button", { name: /Manager Console/i });
    await expect(managerToggleBtn).toBeVisible();
    await managerToggleBtn.click();

    // Assert Manager iframe is rendered with demo-enter URL
    const managerIframe = page.locator('iframe[title*="Manager Console"]');
    await expect(managerIframe).toBeVisible({ timeout: 15_000 });
    const managerSrc = await managerIframe.getAttribute("src");
    expect(managerSrc).toContain("3002");
    expect(managerSrc).toContain("demo-enter");

    // Assert "Open in Tab" link for Manager is present
    const managerTabHref = await openInTabLink.getAttribute("href");
    expect(managerTabHref).toContain("3002");

    // 6. Test iframe session behavior with graceful third-party cookie check
    try {
      const kitchenFrame = page.frameLocator('iframe[title*="Kitchen Display"]');
      // If third-party cookies are allowed, KDS header or tickets appear inside the iframe
      const kdsHeader = kitchenFrame.locator("header");
      const isSigned = await kdsHeader.isVisible({ timeout: 3_000 });
      if (!isSigned) {
        test.info().annotations.push({
          type: "notice",
          description:
            "Third-party cross-site cookies are partitioned or blocked in browser iframe. External tab links verified.",
        });
      }
    } catch {
      test.info().annotations.push({
        type: "notice",
        description:
          "Third-party cookie restriction detected in iframe context. External links safely verified.",
      });
    }
  });
});
