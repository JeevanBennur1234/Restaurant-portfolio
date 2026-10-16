import { test, expect } from "@playwright/test";
import {
  CUSTOMER_URL,
  KITCHEN_URL,
  MANAGER_URL,
} from "./test-helpers";

test.describe("Multi-Site Route Isolation & Proxy Rewriting", () => {
  test("asserts prohibited routes return 404 across customer, kitchen, and manager sites", async ({
    request,
    page,
  }) => {
    // 1. On Customer Site (:3000)
    // /admin and /kitchen must be 404
    const adminOnCustomer = await request.get(`${CUSTOMER_URL}/admin`);
    expect(adminOnCustomer.status()).toBe(404);

    const kitchenOnCustomer = await request.get(`${CUSTOMER_URL}/kitchen`);
    expect(kitchenOnCustomer.status()).toBe(404);

    // /api/v1/admin/orders must be 404 on :3000
    const adminApiOnCustomer = await request.get(
      `${CUSTOMER_URL}/api/v1/admin/orders`
    );
    expect(adminApiOnCustomer.status()).toBe(404);

    // 2. On Kitchen Site (:3001)
    // /admin and /t/x must be 404
    const adminOnKitchen = await request.get(`${KITCHEN_URL}/admin`);
    expect(adminOnKitchen.status()).toBe(404);

    const guestOnKitchen = await request.get(`${KITCHEN_URL}/t/x`);
    expect(guestOnKitchen.status()).toBe(404);

    // 3. On Manager Site (:3002)
    // /kitchen must be 404
    const kitchenOnManager = await request.get(`${MANAGER_URL}/kitchen`);
    expect(kitchenOnManager.status()).toBe(404);

    // 4. Verify browser navigation also renders 404 page
    const pageRes = await page.goto(`${CUSTOMER_URL}/admin`);
    expect(pageRes?.status()).toBe(404);
  });
});
