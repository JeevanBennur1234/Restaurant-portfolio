import { test, expect } from "@playwright/test";
import {
  CUSTOMER_URL,
  KITCHEN_URL,
  DEMO_TABLE_TOKEN,
  resetDemoState,
} from "./test-helpers";

test.describe("Cross-Site Live Flow (Customer + Kitchen)", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("guest places order on :3000, kitchen advances ticket on :3001, and guest tracker updates live", async ({
    browser,
  }) => {
    // Context 1: Guest customer on port 3000
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    // 1. Guest navigates to Table 7 and adds item to cart
    await guestPage.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    await expect(guestPage).toHaveTitle(/Table 7/i, { timeout: 15_000 });
    const firstCard = guestPage.locator('[data-testid="menu-item-card"]:visible').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();

    const addToOrderBtn = guestPage.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 15_000 });
    await addToOrderBtn.click();

    // Open cart, select Pay at Counter, and submit
    const cartBarBtn = guestPage.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    const payCounterChoice = guestPage.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounterChoice).toBeVisible({ timeout: 5_000 });
    await payCounterChoice.click();

    const submitBtn = guestPage.locator('[data-testid="checkout-submit-btn"]');
    await submitBtn.click();

    // Wait for order tracker to load
    await guestPage.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 15_000 });
    const orderBadge = guestPage.locator('[data-testid="order-number-badge"]');
    await expect(orderBadge).toBeVisible({ timeout: 10_000 });
    const fullOrderText = await orderBadge.innerText();
    const orderNumber = fullOrderText.replace("#", "").trim();

    // Verify initial guest status is placed
    const statusTitle = guestPage.locator('[data-testid="order-status-title"]');
    await expect(statusTitle).toContainText(/Placed/i, { timeout: 5_000 });

    // Context 2: Kitchen Display System on port 3001
    const kitchenContext = await browser.newContext();
    const kitchenPage = await kitchenContext.newPage();

    // 2. Kitchen logs in with credentials
    await kitchenPage.goto(`${KITCHEN_URL}/kitchen`);
    await kitchenPage.fill('[data-testid="kitchen-username-input"]', "kitchen");
    await kitchenPage.fill('[data-testid="kitchen-password-input"]', "kitchen@123");
    await kitchenPage.click('[data-testid="kitchen-login-btn"]');

    // Wait for KDS board to load
    await expect(kitchenPage.locator("header")).toBeVisible({ timeout: 15_000 });

    // Locate the specific ticket for the newly placed order
    const orderTicket = kitchenPage.locator(
      `[data-testid="kitchen-ticket"]:has([data-testid="ticket-order-number"]:has-text("${orderNumber}"))`
    );
    await expect(orderTicket).toBeVisible({ timeout: 15_000 });

    // 3. Kitchen transitions ticket: placed -> preparing ("Start Prep")
    const actionBtn = orderTicket.locator('[data-testid="ticket-action-btn"]');
    await expect(actionBtn).toContainText(/Start Prep/i);
    await actionBtn.click();

    // Verify guest tracker confirms order is cooking (database committed preparing status)
    await expect(statusTitle).toContainText(/Cooking|Preparing/i, { timeout: 20_000 });

    // 4. Kitchen transitions ticket: preparing -> ready ("Mark Ready")
    await expect(actionBtn).toContainText(/Mark Ready/i, { timeout: 10_000 });
    await actionBtn.click();

    // 5. In Guest tracker: verify status reaches "Ready" without reload (polling interval is 5s)
    await expect(statusTitle).toContainText(/Ready/i, { timeout: 20_000 });

    // 6. Kitchen transitions ticket: ready -> served ("Served / Dispatch")
    await expect(actionBtn).toContainText(/Served/i, { timeout: 10_000 });
    await actionBtn.click();

    // 7. In Guest tracker: verify status reaches "Served" / "Delivered" without reload
    await expect(statusTitle).toContainText(/Delivered|Served/i, { timeout: 20_000 });

    // Clean up contexts
    await guestContext.close();
    await kitchenContext.close();
  });
});
