import { test, expect } from "@playwright/test";
import crypto from "crypto";
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

  test("guest places order choosing Pay at Counter and verifies counter payment state on live tracker", async ({
    page,
  }) => {
    // 1. Guest visits menu, adds an item, and selects Pay at Counter
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

    // Select "Pay at counter"
    const payCounterChoice = page.locator('[data-testid="pay-counter-choice"]');
    await expect(payCounterChoice).toBeVisible({ timeout: 5_000 });
    await payCounterChoice.click();

    // Submit order
    const submitBtn = page.locator('[data-testid="checkout-submit-btn"]');
    await submitBtn.click();

    // Must navigate to the live order tracker
    await page.waitForURL(/\/t\/demo-table-7\/order\/.+/, { timeout: 30_000 });

    // Verify order tracker displays the order number badge and status
    const orderBadge = page.locator('[data-testid="order-number-badge"]');
    await expect(orderBadge).toBeVisible({ timeout: 10_000 });

    // Verify counter payment badge is displayed
    await expect(page.getByText(/Pay at Counter/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("unconfigured payment gateway safely returns 503 without accepting payment", async ({
    request,
  }) => {
    // 1. Create order via API
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
          "idempotency-key": `rzp-503-test-${Date.now()}`,
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

    // 2. Attempt to initialize Razorpay payment when gateway uses test placeholder
    const rzpRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/razorpay`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {},
      }
    );

    // In non-live test environments, placeholder keys safely fail with 503
    expect(rzpRes.status()).toBe(503);
    const body = await rzpRes.json();
    expect(body.error?.message || body.error).toMatch(/Payment gateway is not configured/i);
  });

  test("Razorpay payment verification with invalid signature is rejected by API and leaves order pending", async ({
    request,
  }) => {
    // 1. Create an order via API
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
          "idempotency-key": `rzp-invalid-sig-${Date.now()}`,
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

    // 2. Insert pending payment record into test database
    const dbUrl =
      process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

    const pgClient = new Client({ connectionString: dbUrl });
    await pgClient.connect();

    const testRzpOrderId = `order_test_${Date.now()}`;
    try {
      const orderRow = await pgClient.query(
        "SELECT restaurant_id, total_paise FROM orders WHERE id = $1",
        [orderId]
      );
      const { restaurant_id: restaurantId, total_paise: totalPaise } = orderRow.rows[0];

      await pgClient.query(
        `INSERT INTO payments (id, restaurant_id, order_id, provider, status, amount_paise, razorpay_order_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'razorpay', 'pending', $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), restaurantId, orderId, totalPaise, testRzpOrderId]
      );
    } finally {
      await pgClient.end();
    }

    // 3. Attempt verification with forged/invalid signature
    const verifyRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/verify`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {
          razorpayOrderId: testRzpOrderId,
          razorpayPaymentId: "pay_fake_payment_123",
          razorpaySignature: "forged_invalid_signature_hex_digest",
        },
      }
    );

    // Must be rejected with 400 Bad Request
    expect(verifyRes.status()).toBe(400);

    // 4. Query order status and assert it remains unpaid ('pending')
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

  test("Razorpay payment verification with valid HMAC-SHA256 signature confirms payment and marks order paid", async ({
    request,
  }) => {
    // 1. Create an order via API
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
          "idempotency-key": `rzp-valid-sig-${Date.now()}`,
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

    // 2. Insert pending payment record into test database
    const dbUrl =
      process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

    const pgClient = new Client({ connectionString: dbUrl });
    await pgClient.connect();

    const testRzpOrderId = `order_valid_${Date.now()}`;
    const testPaymentId = `pay_valid_${Date.now()}`;

    try {
      const orderRow = await pgClient.query(
        "SELECT restaurant_id, total_paise FROM orders WHERE id = $1",
        [orderId]
      );
      const { restaurant_id: restaurantId, total_paise: totalPaise } = orderRow.rows[0];

      await pgClient.query(
        `INSERT INTO payments (id, restaurant_id, order_id, provider, status, amount_paise, razorpay_order_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'razorpay', 'pending', $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), restaurantId, orderId, totalPaise, testRzpOrderId]
      );
    } finally {
      await pgClient.end();
    }

    // 3. Generate genuine HMAC-SHA256 signature using the configured secret
    const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${testRzpOrderId}|${testPaymentId}`)
      .digest("hex");

    // 4. Verify payment via API
    const verifyRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/verify`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {
          razorpayOrderId: testRzpOrderId,
          razorpayPaymentId: testPaymentId,
          razorpaySignature: expectedSignature,
        },
      }
    );

    expect(verifyRes.ok()).toBe(true);
    const verifyData = await verifyRes.json();
    expect(verifyData.data.paymentStatus).toBe("paid");

    // 5. Query order status and assert it is marked 'paid'
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
    expect(orderData.data.paymentStatus).toBe("paid");
  });

  test("amount mismatch during Razorpay payment verification returns an error and leaves order unpaid", async ({
    request,
  }) => {
    // 1. Create an order via API
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

    // 2. Insert payment row with tampered mismatched amount
    const dbUrl =
      process.env.E2E_DATABASE_URL ||
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

    const pgClient = new Client({ connectionString: dbUrl });
    await pgClient.connect();

    const testRzpOrderId = `order_mismatch_${Date.now()}`;
    const testPaymentId = `pay_mismatch_${Date.now()}`;

    try {
      const orderRow = await pgClient.query(
        "SELECT restaurant_id, total_paise FROM orders WHERE id = $1",
        [orderId]
      );
      const { restaurant_id: restaurantId, total_paise: totalPaise } = orderRow.rows[0];
      // Tampered amount: 5000 paise less than required
      const tamperedAmount = Math.max(0, totalPaise - 5000);

      await pgClient.query(
        `INSERT INTO payments (id, restaurant_id, order_id, provider, status, amount_paise, razorpay_order_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'razorpay', 'pending', $4, $5, NOW(), NOW())`,
        [crypto.randomUUID(), restaurantId, orderId, tamperedAmount, testRzpOrderId]
      );
    } finally {
      await pgClient.end();
    }

    // 3. Generate signature with matching orderId and paymentId
    const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder_secret";
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${testRzpOrderId}|${testPaymentId}`)
      .digest("hex");

    // 4. Attempt to confirm payment with mismatched amount
    const verifyRes = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/orders/${orderId}/payment/verify`,
      {
        headers: {
          "x-table-token": DEMO_TABLE_TOKEN,
        },
        data: {
          razorpayOrderId: testRzpOrderId,
          razorpayPaymentId: testPaymentId,
          razorpaySignature: signature,
        },
      }
    );

    // Must fail with 400 Bad Request / CONFLICT
    expect(verifyRes.status()).toBe(400);
    const errorBody = await verifyRes.json();
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
