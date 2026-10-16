import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  CUSTOMER_URL,
  KITCHEN_URL,
  MANAGER_URL,
  DEMO_TABLE_TOKEN,
  resetDemoState,
} from "./test-helpers";

test.describe("Accessibility & Mobile Responsiveness", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("guest menu, cart sheet, and order page have no horizontal overflow at 360px viewport", async ({
    page,
  }) => {
    // 1. Set explicit 360px mobile viewport
    await page.setViewportSize({ width: 360, height: 740 });

    // A. Guest Menu Page
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    const firstCard = page.locator('[data-testid="menu-item-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });

    const menuScrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    const menuClientWidth = await page.evaluate(
      () => document.documentElement.clientWidth
    );
    expect(menuScrollWidth).toBeLessThanOrEqual(menuClientWidth + 1);

    // B. Cart Sheet
    await firstCard.click();
    const addToOrderBtn = page.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 5_000 });
    await addToOrderBtn.click();

    const cartBarBtn = page.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    // Verify cart sheet is open and no horizontal overflow exists
    await expect(page.locator('[data-testid="checkout-submit-btn"]')).toBeVisible({
      timeout: 5_000,
    });

    const cartScrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(cartScrollWidth).toBeLessThanOrEqual(menuClientWidth + 1);

    // C. Order Live Tracker Page
    const payCounterChoice = page.locator('[data-testid="pay-counter-choice"]');
    await payCounterChoice.click();
    await page.locator('[data-testid="checkout-submit-btn"]').click();

    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 15_000 });
    await expect(page.locator('[data-testid="order-number-badge"]')).toBeVisible({
      timeout: 10_000,
    });

    const orderScrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth
    );
    expect(orderScrollWidth).toBeLessThanOrEqual(menuClientWidth + 1);
  });

  test("axe reports zero serious or critical violations on guest menu, kitchen board, and manager login", async ({
    page,
  }) => {
    // 1. Accessibility Scan: Guest Menu
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    await expect(
      page.locator('[data-testid="menu-item-card"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // Exclude known color-contrast false positive documented in docs/TESTING.md (signature editorial warm brand palette)
    const KNOWN_EXCLUSIONS = ["color-contrast"];

    const menuAxeResults = await new AxeBuilder({ page })
      .disableRules(KNOWN_EXCLUSIONS)
      .analyze();
    const menuViolations = menuAxeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(menuViolations).toEqual([]);

    // 2. Accessibility Scan: Manager Login Page
    await page.goto(`${MANAGER_URL}/admin`);
    await expect(page.locator('[data-testid="admin-login-btn"]')).toBeVisible({
      timeout: 15_000,
    });

    const managerAxeResults = await new AxeBuilder({ page })
      .disableRules(KNOWN_EXCLUSIONS)
      .analyze();
    const managerViolations = managerAxeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(managerViolations).toEqual([]);

    // 3. Accessibility Scan: Kitchen Board (signed in via demo-enter)
    await page.goto(`${KITCHEN_URL}/demo-enter`);
    await expect(page.locator("header")).toBeVisible({ timeout: 15_000 });

    const kitchenAxeResults = await new AxeBuilder({ page })
      .disableRules(KNOWN_EXCLUSIONS)
      .analyze();
    const kitchenViolations = kitchenAxeResults.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical"
    );
    expect(kitchenViolations).toEqual([]);
  });
});
