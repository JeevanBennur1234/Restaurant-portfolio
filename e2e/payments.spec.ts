import { test, expect } from "@playwright/test";
import { Client } from "pg";
import {
  CUSTOMER_URL,
  DEMO_TABLE_TOKEN,
  resetDemoState,
} from "./test-helpers";

test.describe("Payment Processing & Integrity Verification", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("DEMO_MODE simulated pay now path confirms payment and marks order paid", async ({
    page,
  }) => {
    // 1. Guest visits menu, adds an item, and selects Pay Now
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    const firstCard = page.locator('[data-testid="menu-item-card"]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.click();

    const addToOrderBtn = page.locator('[data-testid="add-to-order-btn"]');
    await expect(addToOrderBtn).toBeVisible({ timeout: 5_000 });
    await addToOrderBtn.click();

    // Open Cart Sheet
    const cartBarBtn = page.locator('[data-testid="cart-bar-btn"]');
    await expect(cartBarBtn).toBeVisible({ timeout: 5_000 });
    await cartBarBtn.click();

    // Ensure "Pay now" is selected
    const payNowChoice = page.locator('[data-testid="pay-now-choice"]');
    await expect(payNowChoice).toBeVisible({ timeout: 5_000 });
    await payNowChoice.click();

    // Submit Pay Now order
    const submitBtn = page.locator('[data-testid="checkout-submit-btn"]');
    await submitBtn.click();

    // 2. In DEMO_MODE, client executes simulated payment verification
    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });

    // Assert the order page shows Paid Online
    await expect(page.getByText(/Paid Online/i)).toBeVisible({ timeout: 20_000 });
  });

  test("amount mismatch via the API returns an error and leaves the order unpaid", async ({
    request,
  }) => {
    // 1. Create an order via API with paymentMethod: pay_now
    // First get menu to obtain a valid menuItemId
    const menuRes = await request.get(
      `${CUSTOMER_URL}/api/v1/customer/tables/${DEMO_TABLE_TOKEN}/menu`
    );
    expect(menuRes.ok()).toBe(true);
    const menuData = await menuRes.json();
    const item = menuData.data.items[0];

    const placeRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/tables/${DEMO_TABLE_TOKEN}/orders`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
          "idempotency-key": `mismatch-test-${Date.now()}`,
        },
        data: {
          token: DEMO_TABLE_TOKEN,
          paymentMethod: "pay_now",
          items: [{ menuItemId: item.id, quantity: 1, selectedModifierIds: [] }],
        },
      }
    );
    expect(placeRes.ok()).toBe(true);
    const placeData = await placeRes.json();
    const orderId = placeData.data.orderId;

    // 2. Initialize simulated payment for order
    const rzpRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/razorpay`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {},
      }
    );
    expect(rzpRes.ok()).toBe(true);

    // 3. Connect to Postgres and tamper with payments row amount to simulate tampering / mismatch
    const dbUrl =
      process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

    const pgClient = new Client({ connectionString: dbUrl });
    await pgClient.connect();

    try {
      // Tamper payments amount
      await pgClient.query(
        "UPDATE payments SET amount_paise = amount_paise - 5000 WHERE order_id = $1",
        [orderId]
      );
    } finally {
      await pgClient.end();
    }

    // 4. Attempt to confirm payment with mismatched amount
    const confirmRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/simulate`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {},
      }
    );

    // Must fail with 400 Bad Request / CONFLICT
    expect(confirmRes.status()).toBe(400);
    const errorBody = await confirmRes.json();
    const errMsg =
      typeof errorBody.error === "string"
        ? errorBody.error
        : errorBody.error?.message || errorBody.message;
    expect(errMsg).toMatch(/mismatch/i);

    // 5. Query order status and assert it remains unpaid ('pending')
    const orderCheckRes = await request.get(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
      }
    );
    expect(orderCheckRes.ok()).toBe(true);
    const orderData = await orderCheckRes.json();
    expect(orderData.data.paymentStatus).toBe("pending");
  });
});
