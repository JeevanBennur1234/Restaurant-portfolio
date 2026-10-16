import { test, expect } from "@playwright/test";
import {
  KITCHEN_URL,
  MANAGER_URL,
  SEEDED_KITCHEN_USER,
  resetDemoState,
} from "./test-helpers";

test.describe("Staff Authentication Isolation & Role Gating", () => {
  test.beforeEach(async ({ request }) => {
    await resetDemoState(request);
  });

  test("kitchen session cookie gives 401 on manager site /api/v1/auth/me", async ({
    request,
  }) => {
    // 1. Sign in as kitchen staff on kitchen origin (:3001)
    const loginRes = await request.post(`${KITCHEN_URL}/api/v1/auth/login`, {
      headers: {
        Origin: KITCHEN_URL,
      },
      data: {
        username: SEEDED_KITCHEN_USER.username,
        password: SEEDED_KITCHEN_USER.password,
      },
    });

    expect(loginRes.ok()).toBe(true);

    // Extract session cookie from response
    const setCookie = loginRes.headers()["set-cookie"] || "";
    expect(setCookie).toBeTruthy();

    const cookiePair = setCookie.split(";")[0];

    // 2. Present that kitchen session cookie to manager site (:3002)
    const meRes = await request.get(`${MANAGER_URL}/api/v1/auth/me`, {
      headers: {
        Cookie: cookiePair,
      },
    });

    // Must be rejected with 401 due to audience / cookie name mismatch
    expect(meRes.status()).toBe(401);
  });

  test("seeded kitchen user signing in on manager site sees role rejection, and lockout triggers after 5 wrong attempts", async ({
    page,
  }) => {
    // 1. Navigate to Manager sign-in page on :3002
    await page.goto(`${MANAGER_URL}/admin`);
    await expect(page.locator('[data-testid="admin-login-btn"]')).toBeVisible({
      timeout: 15_000,
    });

    // 2. Try to log in with valid kitchen credentials on manager site
    await page.fill(
      '[data-testid="admin-username-input"]',
      SEEDED_KITCHEN_USER.username
    );
    await page.fill(
      '[data-testid="admin-password-input"]',
      SEEDED_KITCHEN_USER.password
    );
    await page.click('[data-testid="admin-login-btn"]');

    // Assert role rejection message
    const errorAlert = page.locator(".rounded-lg.bg-red-50, .rounded-lg.bg-red-950\\/70");
    await expect(errorAlert).toContainText(
      "This account can't sign in on this site."
    );

    // 3. Perform failed password attempts using a fresh username to test 5-attempt rate-limit lockout
    const lockoutTestUser = "testlockoutuser";
    for (let attempt = 1; attempt <= 5; attempt++) {
      await page.fill('[data-testid="admin-username-input"]', lockoutTestUser);
      await page.fill(
        '[data-testid="admin-password-input"]',
        `wrongpass${attempt}`
      );
      await page.click('[data-testid="admin-login-btn"]');
      await expect(errorAlert).toBeVisible();
    }

    // 6th attempt should now trigger the lockout message
    await page.fill('[data-testid="admin-username-input"]', lockoutTestUser);
    await page.fill('[data-testid="admin-password-input"]', "wrongpass6");
    await page.click('[data-testid="admin-login-btn"]');

    await expect(errorAlert).toContainText(
      /Too many failed login attempts.*15 minutes/i,
      { timeout: 5_000 }
    );
  });
});
