import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  CUSTOMER_URL,
  DEMO_TABLE_TOKEN,
  resetDemoState,
} from "./test-helpers";

test.describe("Customer Food Ordering Journey", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("homepage Order at Table CTA navigates to customer ordering entry point (/order)", async ({
    page,
  }) => {
    // 1. Visit homepage
    await page.goto(`${CUSTOMER_URL}/`);
    await expect(page).toHaveTitle(/DinePulse/i);
    await expect(page.getByRole("heading", { name: "Masala Lane" }).first()).toBeVisible();

    // 2. Click primary "Order at Table" in header navbar
    const headerOrderBtn = page.locator('[data-testid="header-order-btn"]');
    await expect(headerOrderBtn).toBeVisible({ timeout: 10_000 });
    await headerOrderBtn.click();

    // 3. Assert navigation to /order
    await page.waitForURL(`${CUSTOMER_URL}/order`, { timeout: 30_000 });
    await expect(page).toHaveTitle(/Table Ordering | Masala Lane/i);
    await expect(page.getByRole("heading", { name: "Order at Your Table" })).toBeVisible();

    // 4. In development mode, verify the safe dev bridge displays the configured table
    const devSection = page.locator('[data-testid="dev-table-section"]');
    await expect(devSection).toBeVisible({ timeout: 15_000 });
    await expect(devSection.getByText(/Local Development Session/i)).toBeVisible();

    // 5. Test manual token form validation (empty input)
    const submitBtn = page.locator('[data-testid="submit-table-token-btn"]');
    await submitBtn.click();
    await expect(page.getByText(/Please enter a table token or URL/i)).toBeVisible();

    // 6. Test external URL rejection
    const tokenInput = page.locator('[data-testid="table-token-input"]');
    await tokenInput.fill("https://evil.com/t/attack-token");
    await submitBtn.click();
    await expect(page.getByText(/External URLs are not allowed/i)).toBeVisible();

    // 7. Test invalid token format rejection
    await tokenInput.fill("token with spaces!");
    await submitBtn.click();
    await expect(page.getByText(/Invalid table token format/i)).toBeVisible();
  });

  test("customer ordering entry point redirects to interactive menu for valid and rejects invalid tokens", async ({
    page,
  }) => {
    // 1. Navigate to /order
    await page.goto(`${CUSTOMER_URL}/order`);
    await expect(page.locator('[data-testid="table-token-input"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-testid="submit-table-token-btn"]')).toBeVisible({ timeout: 15_000 });

    // 2. Enter an invalid token into the form
    const tokenInput = page.locator('[data-testid="table-token-input"]');
    await tokenInput.fill("invalid-nonexistent-token-xyz");
    await page.locator('[data-testid="submit-table-token-btn"]').click();

    // 3. Assert routed to /t/invalid-nonexistent-token-xyz showing secure InvalidTokenView
    await page.waitForURL(/\/t\/invalid-nonexistent-token-xyz/, { timeout: 30_000 });
    await expect(page.getByText(/QR Code Not Recognized/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/We could not find an active table session/i)).toBeVisible();
    // Static or interactive menu must NOT be displayed
    await expect(page.locator('[data-testid="menu-item-card"]:visible')).toHaveCount(0);

    // 4. Test direct navigation to /t without token redirects back to /order
    await page.goto(`${CUSTOMER_URL}/t`);
    await page.waitForURL(`${CUSTOMER_URL}/order`, { timeout: 30_000 });

    // 5. From /order, launch the development table ordering button
    const devStartBtn = page.locator('[data-testid="dev-start-order-btn"]');
    await expect(devStartBtn).toBeVisible({ timeout: 15_000 });
    await devStartBtn.click();

    // 6. Assert genuine interactive menu loads with table label
    await page.waitForURL(/\/t\/.+/, { timeout: 30_000 });
    await expect(page).toHaveTitle(/Table 7/i);
    const itemCards = page.locator('[data-testid="menu-item-card"]:visible');
    await expect(itemCards.first()).toBeVisible({ timeout: 15_000 });
  });

  test("full customer ordering journey: select food, customize modifiers, pay at counter, track live", async ({
    page,
  }) => {
    // 1. Open customer ordering page using valid table QR token
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    const firstCard = page.locator('[data-testid="menu-item-card"]:visible').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await firstCard.click();

    const addToOrderBtn = page.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 10_000 });

    const modifierOptions = page.locator('[data-testid="modifier-option"]');
    if ((await modifierOptions.count()) > 0) {
      await modifierOptions.first().click();
    }
    await addToOrderBtn.click();
    await expect(addToOrderBtn).toBeHidden({ timeout: 5_000 });

    // 4. Open Cart Sheet and review totals
    const cartBarBtn = page.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    // 5. Select "Pay at counter"
    const payCounterChoice = page.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounterChoice).toBeVisible({ timeout: 5_000 });
    await payCounterChoice.click();

    // 7. Submit the order (with double click to verify idempotency)
    const submitBtn = page.locator('[data-testid="checkout-submit-btn"]');
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();
    await submitBtn.click({ force: true }).catch(() => {});

    // 8. Assert navigation to order live tracker and order number display
    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });

    const orderNumberBadge = page.locator('[data-testid="order-number-badge"]');
    await expect(orderNumberBadge).toBeVisible({ timeout: 20_000 });
    const orderNumberText = await orderNumberBadge.innerText();
    expect(orderNumberText).toMatch(/#ML-\d{4}/);

    // 9. Verify order counter payment badge on tracker
    await expect(page.getByText(/Pay at Counter/i).first()).toBeVisible({ timeout: 10_000 });

    // 10. Verify that only ONE new order was placed for Table 7 in the test database
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

    // The brand mark on the tracker should return the guest to this table's menu.
    const brandHomeLink = page.locator('[data-testid="guest-brand-home-link"]:visible').first();
    await expect(brandHomeLink).toHaveAttribute("href", `/t/${DEMO_TABLE_TOKEN}`);
    await brandHomeLink.click();
    await expect(page).toHaveURL(new RegExp(`/t/${DEMO_TABLE_TOKEN}/?$`));
    await expect(page.locator('[data-testid="menu-item-card"]:visible').first()).toBeVisible();
  });

  test("missing Razorpay configuration in cart does not produce fake payment success and allows Pay at Counter recovery", async ({
    page,
  }) => {
    // 1. Visit table ordering page
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    const firstCard = page.locator('[data-testid="menu-item-card"]:visible').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    await firstCard.click();

    // 2. Add an item to cart
    const addToOrderBtn = page.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 10_000 });
    await addToOrderBtn.click();
    await expect(addToOrderBtn).toBeHidden({ timeout: 5_000 });

    // 3. Open cart sheet
    const cartBarBtn = page.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    // 4. Default payment method is "Pay now" (online)
    const payNowChoice = page.locator('[data-testid="pay-now-choice"]');
    await expect(payNowChoice).toBeVisible();

    // 5. Submit checkout with unconfigured Razorpay test credentials
    const submitBtn = page.locator('[data-testid="checkout-submit-btn"]');
    await submitBtn.click();

    // 6. Must show useful error or test mode notice and NEVER fake payment success
    await expect(
      page.getByText(
        /Payment gateway is not configured|Could not initialize payment|Could not retrieve payment|Razorpay Test Mode Notice|UPI QR Unavailable|Dynamic UPI QR codes are not available/i
      )
    ).toBeVisible({ timeout: 15_000 });

    // 7. Verify safe recovery: click "Pay at Counter Instead"
    const counterRecoveryBtn = page.getByRole("button", { name: /Pay at Counter Instead/i });
    await expect(counterRecoveryBtn).toBeVisible({ timeout: 5_000 });
    await counterRecoveryBtn.click();

    // 8. Assert successful switch to live order tracker with counter payment
    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });
    const orderNumberBadge = page.locator('[data-testid="order-number-badge"]');
    await expect(orderNumberBadge).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Pay at Counter/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
