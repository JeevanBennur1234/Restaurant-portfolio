import { test, expect } from "@playwright/test";
import { CUSTOMER_URL, resetDemoState } from "./test-helpers";

test.describe("Customer Landing Page & Safe Routing", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("homepage renders restaurant branding and table ordering navigation", async ({ page }) => {
    await page.goto(CUSTOMER_URL);
    await expect(page).toHaveTitle(/Masala Lane|DinePulse/i);

    // Verify restaurant branding
    await expect(page.getByRole("heading", { name: "Masala Lane", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Verify hero action anchors
    const signatureLink = page.getByRole("link", { name: "View signature dishes" });
    await expect(signatureLink).toBeVisible();
    await expect(signatureLink).toHaveAttribute("href", "#signature-dishes");

    const dineInLink = page.getByRole("link", { name: "Dine-In QR Ordering" });
    await expect(dineInLink).toBeVisible();
    await expect(dineInLink).toHaveAttribute("href", "#table-ordering");
  });

  test("removed demo routes return 404 Not Found", async ({ page, request }) => {
    // 1. HTTP API / route check: /demo returns 404
    const demoRes = await request.get(`${CUSTOMER_URL}/demo`);
    expect(demoRes.status()).toBe(404);

    // 2. Browser navigation to /demo renders 404 page
    const pageRes = await page.goto(`${CUSTOMER_URL}/demo`);
    expect(pageRes?.status()).toBe(404);

    // 3. /demo-enter returns 404
    const demoEnterRes = await request.get(`${CUSTOMER_URL}/demo-enter`);
    expect(demoEnterRes.status()).toBe(404);
  });

  test("invalid table token displays user-friendly recovery view with return home button", async ({
    page,
  }) => {
    await page.goto(`${CUSTOMER_URL}/t/non-existent-table-xyz`);
    await expect(
      page.getByRole("heading", { name: /QR Code Not Recognized|Invalid Table|Not Found/i })
    ).toBeVisible({
      timeout: 15_000,
    });

    const returnBtn = page.getByRole("link", { name: /Return to/i });
    await expect(returnBtn).toBeVisible();
    await returnBtn.click();
    await expect(page).toHaveURL(new RegExp(`^${CUSTOMER_URL}/?$`));
  });
});
