import { test, expect } from "@playwright/test";
import {
  CUSTOMER_URL,
  KITCHEN_URL,
  DEMO_TABLE_TOKEN,
  SEEDED_KITCHEN_USER,
  resetDemoState,
} from "./test-helpers";

test.describe("Dine-In Open Tab Journey", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("places multiple rounds, immediately displays on kitchen with round badges, and settles consolidated tab", async ({
    page,
    request,
  }) => {
    // 1. Visit table menu
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`);
    await expect(page.locator('[data-testid="menu-item-card"]:visible').first()).toBeVisible({
      timeout: 15_000,
    });

    // 2. Fetch sample menu items via API to place deterministic open tab rounds
    const menuRes = await request.get(`${CUSTOMER_URL}/api/v1/customer/tables/${DEMO_TABLE_TOKEN}/menu`);
    expect(menuRes.ok()).toBe(true);
    const menuData = (await menuRes.json()) as { data: { items: Array<{ id: string; name: string }> } };
    const firstItem = menuData.data.items[0];
    const secondItem = menuData.data.items[1];

    // 3. Place Round 1 on Table Tab via customer tab orders endpoint
    const round1Res = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/tables/${DEMO_TABLE_TOKEN}/tab/orders`,
      {
        data: {
          token: DEMO_TABLE_TOKEN,
          items: [{ menuItemId: firstItem.id, quantity: 2, selectedModifierIds: [] }],
          customerName: "Ananya",
        },
      }
    );
    expect(round1Res.ok()).toBe(true);
    const round1Data = (await round1Res.json()) as { data: { roundNumber: number; tabId: string; orderNumber: string } };
    expect(round1Data.data.roundNumber).toBe(1);

    // 4. Revisit the table menu to verify the active tab survives a full navigation.
    // Use an explicit navigation rather than reload(), which can be aborted by
    // Next.js PPR refreshing the current document during realtime polling.
    await page.goto(`${CUSTOMER_URL}/t/${DEMO_TABLE_TOKEN}`, { waitUntil: "domcontentloaded" });
    const tabBanner = page.locator('[data-testid="active-tab-banner"]');
    await expect(tabBanner).toBeVisible({ timeout: 10_000 });
    await expect(tabBanner).toContainText("Open Dining Tab");
    await expect(tabBanner).toContainText("Current bill:");

    // 5. Place Round 2 on same Table Tab
    const round2Res = await request.post(
      `${CUSTOMER_URL}/api/v1/customer/tables/${DEMO_TABLE_TOKEN}/tab/orders`,
      {
        data: {
          token: DEMO_TABLE_TOKEN,
          items: [{ menuItemId: secondItem.id, quantity: 1, selectedModifierIds: [] }],
        },
      }
    );
    expect(round2Res.ok()).toBe(true);
    const round2Data = (await round2Res.json()) as { data: { roundNumber: number; orderNumber: string } };
    expect(round2Data.data.roundNumber).toBe(2);

    // 6. Reload table menu and verify Active Tab Banner displays Round 2 with updated bill
    await page.reload();
    await expect(tabBanner).toBeVisible({ timeout: 10_000 });
    await expect(tabBanner).toContainText("Open Dining Tab");
    await expect(tabBanner).toContainText("Current bill:");

    // 7. Open Tab Modal
    const viewTabBtn = page.locator('[data-testid="view-tab-btn"]');
    await expect(viewTabBtn).toBeVisible({ timeout: 5_000 });
    await viewTabBtn.click();

    const tabModal = page.locator('[data-testid="tab-modal"]');
    await expect(tabModal).toBeVisible({ timeout: 10_000 });
    await expect(tabModal).toContainText("Table 7");

    // Exercise the actual bill modal at the four requested desktop/mobile viewports.
    const originalViewport = page.viewportSize() ?? { width: 1280, height: 720 };
    for (const viewport of [
      { width: 1365, height: 900 },
      { width: 1024, height: 768 },
      { width: 393, height: 727 },
      { width: 360, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(tabModal).toBeVisible();
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector<HTMLElement>('[data-testid="tab-modal"]');
        const panel = dialog?.firstElementChild as HTMLElement | null;
        const rect = panel?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
          documentWidth: document.documentElement.scrollWidth,
          panelLeft: rect?.left ?? -1,
          panelRight: rect?.right ?? Number.MAX_SAFE_INTEGER,
          panelWidth: rect?.width ?? Number.MAX_SAFE_INTEGER,
          panelTop: rect?.top ?? -1,
          panelBottom: rect?.bottom ?? Number.MAX_SAFE_INTEGER,
          panelHeight: rect?.height ?? Number.MAX_SAFE_INTEGER,
        };
      });
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.panelLeft).toBeGreaterThanOrEqual(0);
      expect(layout.panelRight).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.panelTop).toBeGreaterThanOrEqual(0);
      expect(layout.panelBottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.panelWidth).toBeLessThanOrEqual(layout.viewportWidth);
      expect(layout.panelHeight).toBeLessThanOrEqual(layout.viewportHeight);
      await expect(tabModal.locator('button[aria-label="Close tab modal"]')).toBeVisible();
      await expect(tabModal.locator('[data-testid="request-tab-bill-btn"]')).toBeVisible();
      await expect(tabModal.getByRole("button", { name: /Add More Dishes/i })).toBeVisible();
      await page.screenshot({ path: `test-results/bill-modal-${viewport.width}x${viewport.height}.png` });
    }
    await page.setViewportSize(originalViewport);
    // The guest modal consolidates multiple rounds into one item summary.
    const tabItemsSummary = tabModal.locator('[data-testid="tab-items-summary"]');
    await expect(tabItemsSummary).toContainText(firstItem.name);
    await expect(tabItemsSummary).toContainText(secondItem.name);

    // 8. Request bill and settle tab via online test payment simulation
    const requestBillBtn = page.locator('[data-testid="request-tab-bill-btn"]');
    await expect(requestBillBtn).toBeVisible({ timeout: 5_000 });
    await requestBillBtn.click();

    const payOnlineBtn = page.locator('[data-testid="pay-tab-online-btn"]');
    // The bill request uses a bounded 15s API timeout; allow a little room on mobile CI.
    await expect(payOnlineBtn).toBeVisible({ timeout: 20_000 });
    await payOnlineBtn.click();

    // Verify Tab Settled message and receipt download button
    const receiptDownloadBtn = page.locator('[data-testid="download-tab-receipt-btn"]');
    await expect(page.locator('[data-testid="tab-paid-awaiting-service"]')).toBeVisible({ timeout: 15_000 });
    await expect(receiptDownloadBtn).toHaveCount(0);

    await expect(page.locator('[data-testid="tab-status-badge"]')).toContainText("Awaiting Service");

    // 9. Verify Kitchen KDS renders Round 1 and Round 2 badges for staff
    const kitchenPage = await page.context().newPage();
    await kitchenPage.goto(`${KITCHEN_URL}/kitchen`);
    await kitchenPage.fill('[data-testid="kitchen-username-input"]', SEEDED_KITCHEN_USER.username);
    await kitchenPage.fill('[data-testid="kitchen-password-input"]', SEEDED_KITCHEN_USER.password);
    await kitchenPage.click('[data-testid="kitchen-login-btn"]');
    await expect(kitchenPage.locator("header")).toBeVisible({ timeout: 15_000 });

    // Table 7 tickets should display Round 1 and Round 2 badges
    const round1Badge = kitchenPage.locator('[data-testid="ticket-round-badge"]:has-text("Round 1")');
    const round2Badge = kitchenPage.locator('[data-testid="ticket-round-badge"]:has-text("Round 2")');
    await expect(round1Badge.first()).toBeVisible({ timeout: 15_000 });
    await expect(round2Badge.first()).toBeVisible({ timeout: 15_000 });

    const round1Ticket = kitchenPage.locator(`[data-testid="kitchen-ticket"]:has([data-testid="ticket-order-number"]:has-text("${round1Data.data.orderNumber}"))`);
    const round2Ticket = kitchenPage.locator(`[data-testid="kitchen-ticket"]:has([data-testid="ticket-order-number"]:has-text("${round2Data.data.orderNumber}"))`);
    for (const ticket of [round1Ticket, round2Ticket]) {
      const actionButton = ticket.locator('[data-testid="ticket-action-btn"]');
      await expect(actionButton).toContainText(/Start Prep/i, { timeout: 10_000 });
      await actionButton.click();
      await expect(actionButton).toContainText(/Mark Ready/i, { timeout: 10_000 });
      await actionButton.click();
      await expect(actionButton).toContainText(/Served/i, { timeout: 10_000 });
      await actionButton.click();
    }

    await expect(page.locator('[data-testid="tab-status-badge"]')).toContainText("Settled", { timeout: 20_000 });
    await expect(receiptDownloadBtn).toBeVisible({ timeout: 15_000 });
    await kitchenPage.close();
  });
});
