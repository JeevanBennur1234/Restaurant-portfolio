import { test, expect } from "@playwright/test";
import {
  MANAGER_URL,
  SEEDED_MANAGER_USER,
  resetDemoState,
} from "./test-helpers";

test.describe("Manager Administration Console", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("manager logs in with real credentials, manages catalog, downloads QR PDF, cancels order, and views reports", async ({
    page,
  }) => {
    // 1. Log in as the seeded manager on :3002 using real credentials (not demo button)
    await page.goto(`${MANAGER_URL}/admin`);
    await expect(page.locator('[data-testid="admin-login-btn"]')).toBeVisible({
      timeout: 15_000,
    });
    // Wait for the manager site's client bundle and auth route to finish compiling
    // before submitting credentials in the dev-server E2E environment.
    await page.waitForLoadState("networkidle");

    await page.fill(
      '[data-testid="admin-username-input"]',
      SEEDED_MANAGER_USER.username
    );
    await page.fill(
      '[data-testid="admin-password-input"]',
      SEEDED_MANAGER_USER.password
    );
    await page.click('[data-testid="admin-login-btn"]');

    // Verify dashboard navigation bar is displayed (supports desktop or mobile bar)
    const navOrders = page
      .locator('[data-testid="admin-nav-orders"]:visible, [data-testid="admin-nav-mobile-orders"]:visible')
      .first();
    await expect(navOrders).toBeVisible({ timeout: 30_000 });

    // 2. Manage Catalog: Navigate to Menu tab and create a category & item
    const navMenu = page
      .locator('[data-testid="admin-nav-menu"]:visible, [data-testid="admin-nav-mobile-menu"]:visible')
      .first();
    await navMenu.click();

    // Create Category
    const addCategoryBtn = page.locator('[data-testid="add-category-btn"]');
    await expect(addCategoryBtn).toBeVisible({ timeout: 10_000 });
    await addCategoryBtn.click();

    const categoryName = `Spec Sweets ${Date.now()}`;
    await page.fill('[data-testid="category-name-input"]', categoryName);
    await page.click('[data-testid="save-category-btn"]');
    await expect(page.getByText(categoryName)).toBeVisible({ timeout: 10_000 });

    // Create Menu Item
    const addItemBtn = page.locator('[data-testid="add-item-btn"]');
    await addItemBtn.click();

    const itemName = `Pista Malai Kulfi ${Date.now()}`;
    await page.fill('[data-testid="item-name-input"]', itemName);

    // Ensure a category is selected if the form requires it (or select newly created category)
    const categorySelect = page.locator("form select");
    await expect(categorySelect).toBeVisible({ timeout: 5_000 });
    const selectedCategoryVal = await categorySelect.inputValue();
    if (!selectedCategoryVal) {
      await categorySelect.selectOption({ label: categoryName });
    } else {
      expect(selectedCategoryVal.length).toBeGreaterThan(0);
    }

    // Fill a valid price if the form does not default safely
    const priceInput = page.locator('input[type="number"][min="1"]').first();
    const currentPrice = await priceInput.inputValue();
    if (!currentPrice || Number(currentPrice) <= 0) {
      await priceInput.fill("295");
    }

    await page.click('[data-testid="save-item-btn"]');
    await expect(page.getByText(itemName)).toBeVisible({ timeout: 10_000 });

    // 3. Manage Tables: Navigate to Tables tab and create a table
    const navTables = page
      .locator('[data-testid="admin-nav-tables"]:visible, [data-testid="admin-nav-mobile-tables"]:visible')
      .first();
    await navTables.click();

    const addTableBtn = page.locator('[data-testid="add-table-btn"]');
    await expect(addTableBtn).toBeVisible({ timeout: 10_000 });
    await addTableBtn.click();

    const tableName = `Table ${Date.now()}`;
    await page.fill('[data-testid="table-number-input"]', tableName);
    await page.click('[data-testid="submit-create-table-btn"]');
    await expect(page.getByText(tableName)).toBeVisible({ timeout: 10_000 });

    // 4. Download QR PDF and assert Content-Type and %PDF binary header
    const downloadLink = page.locator('[data-testid="download-qr-pdf-btn"]');
    await expect(downloadLink).toBeVisible();

    const pdfRes = await page.request.get(`${MANAGER_URL}/api/v1/admin/tables/qr.pdf`);
    expect(pdfRes.ok()).toBe(true);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");

    const pdfBuffer = await pdfRes.body();
    expect(pdfBuffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");

    // 5. Cancel an order in Live Orders
    await navOrders.click();
    const cancelOrderBtn = page.locator('[data-testid="cancel-order-btn"]:visible').first();
    await expect(cancelOrderBtn).toBeVisible({ timeout: 10_000 });
    await cancelOrderBtn.click();

    // Fill cancel reason in modal
    const reasonInput = page.locator('[data-testid="cancel-reason-input"]');
    await expect(reasonInput).toBeVisible({ timeout: 5_000 });
    await reasonInput.fill("Guest requested order cancellation");

    await page.click('[data-testid="confirm-cancel-btn"]');

    // Confirm that Cancelled badge appears
    await expect(page.locator("span:visible").filter({ hasText: /^Cancelled$/ }).first()).toBeVisible({ timeout: 10_000 });

    // 6. Open Reports & Insights tab
    const navReports = page
      .locator('[data-testid="admin-nav-reports"]:visible, [data-testid="admin-nav-mobile-reports"]:visible')
      .first();
    await navReports.click();
    await expect(
      page.getByText(/Sales & Operational Analytics|Sales & Performance Insights|Today's Revenue|Gross Revenue/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
