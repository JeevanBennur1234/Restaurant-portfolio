import { type APIRequestContext, expect } from "@playwright/test";

export const CUSTOMER_URL = "http://localhost:3000";
export const KITCHEN_URL = "http://localhost:3001";
export const MANAGER_URL = "http://localhost:3002";

export const DEMO_RESET_SECRET = "e2e-demo-reset-secret-at-least-32-chars-long";
export const DEMO_TABLE_TOKEN = "demo-table-7";

export const SEEDED_KITCHEN_USER = {
  username: "kitchen",
  password: "kitchen123",
};

export const SEEDED_MANAGER_USER = {
  username: "manager",
  password: "manager123",
};

/**
 * Resets demo orders, tickets, and tables back to a clean deterministic state
 * using the authenticated demo reset endpoint on the customer server (:3000).
 */
export async function resetDemoState(request: APIRequestContext) {
  const res = await request.post(`${CUSTOMER_URL}/api/demo/reset`, {
    headers: {
      Authorization: `Bearer ${DEMO_RESET_SECRET}`,
    },
  });

  if (!res.ok()) {
    const errorText = await res.text();
    throw new Error(
      `Failed to reset demo state (${res.status()}): ${errorText}`
    );
  }

  const json = await res.json();
  expect(json.success).toBe(true);
}
