import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  CUSTOMER_URL,
  DEMO_TABLE_TOKEN,
  resetDemoState,
} from "./test-helpers";

test.describe("Guest Customer Ordering Flow", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("places an order with items and modifiers using Pay at Counter and verifies idempotency", async ({
    page,
  }) => {
    // 1. Open Table 7 guest ordering page on customer site (:3000)
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    await expect(page).toHaveTitle(/Table 7/i);

    // Wait for menu items to render
    const itemCards = page.locator('[data-testid="menu-item-card"]');
    await expect(itemCards.first()).toBeVisible({ timeout: 15_000 });

    // 2. Select first item and configure modifier if available
    await itemCards.first().click();

    // Check if modifier sheet is open
    const addToOrderBtn = page.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 5_000 });

    const modifierOptions = page.locator('[data-testid="modifier-option"]');
    if ((await modifierOptions.count()) > 0) {
      await modifierOptions.first().click();
    }
    await addToOrderBtn.click();

    // 3. Select a second item
    const secondCard = itemCards.nth(1);
    await secondCard.click();
    await expect(addToOrderBtn).toBeVisible({ timeout: 5_000 });
    if ((await modifierOptions.count()) > 0) {
      await modifierOptions.first().click();
    }
    await addToOrderBtn.click();

    // 4. Open Cart Sheet
    const cartBarBtn = page.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    // 5. Select "Pay at counter"
    const payCounterChoice = page.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounterChoice).toBeVisible({ timeout: 5_000 });
    await payCounterChoice.click();

    // 6. Submit the order (simulate double-click to test idempotency guard)
    const submitBtn = page.locator('[data-testid="checkout-submit-btn"]');
    await expect(submitBtn).toBeVisible();

    // Rapid double click on submit button
    await submitBtn.dblclick();

    // 7. Assert navigation to order live tracker and order number display
    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });

    const orderNumberBadge = page.locator('[data-testid="order-number-badge"]');
    await expect(orderNumberBadge).toBeVisible({ timeout: 20_000 });
    const orderNumberText = await orderNumberBadge.innerText();
    expect(orderNumberText).toMatch(/#ML-\d{4}/);

    // 8. Verify that only ONE new order was placed for Table 7
    // After reset, there are 2 demo orders: ML-0001 (Table 3), ML-0002 (Table 7).
    // So Table 7 should now have exactly 2 orders: ML-0002 and the new ML-0003.
    const dbUrl =
      process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";
    const pgClient = new Client({ connectionString: dbUrl });
    await pgClient.connect();
    try {
      const ordersRes = await pgClient.query(
        "SELECT o.id, o.order_number FROM orders o JOIN tables t ON o.table_id = t.id WHERE t.qr_token = $1",
        [DEMO_TABLE_TOKEN]
      );
      // Exactly 2 orders for Table 7 (1 pre-seeded + 1 newly placed)
      expect(ordersRes.rows.length).toBe(2);
      const numbers = ordersRes.rows.map((r: { order_number: string }) => r.order_number).sort();
      expect(numbers).toEqual(["ML-0002", "ML-0003"]);
    } finally {
      await pgClient.end();
    }
  });
});
