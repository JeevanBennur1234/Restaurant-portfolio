import crypto from "node:crypto";
import { type APIRequestContext } from "@playwright/test";
import { Client } from "pg";
import { validateSafeE2EDatabaseUrl } from "./global-setup";

export const CUSTOMER_URL = "http://localhost:3000";
export const KITCHEN_URL = "http://localhost:3001";
export const MANAGER_URL = "http://localhost:3002";

export const DEMO_TABLE_TOKEN = "demo-table-7";

export const SEEDED_KITCHEN_USER = {
  username: "kitchen",
  password: "kitchen@123",
};

export const SEEDED_MANAGER_USER = {
  username: "manager",
  password: "manager@123",
};

/**
 * Resets orders, open-tab sessions, tickets, and tables back to a clean deterministic state
 * directly in the local test PostgreSQL database.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resetDemoState(_request?: APIRequestContext): Promise<void> {
  const dbUrl =
    process.env.E2E_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5433/dinepulse_e2e";

  const validation = validateSafeE2EDatabaseUrl(dbUrl);
  if (!validation.safe) {
    throw new Error(validation.reason);
  }

  const cleanDbUrl = dbUrl.replace(/^["']|["']$/g, "").trim();
  const client = new Client({ connectionString: cleanDbUrl });
  await client.connect();

  try {
    await client.query("BEGIN");

    // 1. Get masala-lane restaurant
    const restRes = await client.query(
      "SELECT id FROM restaurants WHERE slug = 'masala-lane' LIMIT 1"
    );
    if (restRes.rows.length === 0) {
      throw new Error("Restaurant 'masala-lane' not found in test database");
    }
    const restaurantId = restRes.rows[0].id;

    // 2. Delete existing orders and related records
    await client.query(
      `DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = $1)`,
      [restaurantId]
    );
    await client.query(
      `DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = $1)`,
      [restaurantId]
    );
    await client.query(
      `DELETE FROM payments WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = $1)`,
      [restaurantId]
    );
    await client.query(
      `DELETE FROM orders WHERE restaurant_id = $1`,
      [restaurantId]
    );
    // Orders are cleared above, but their dining sessions are independent rows.
    // Remove those too so a failed open-tab test cannot poison later order tests.
    await client.query(
      `DELETE FROM dining_sessions WHERE restaurant_id = $1`,
      [restaurantId]
    );
    await client.query(
      `DELETE FROM idempotency_keys WHERE restaurant_id = $1`,
      [restaurantId]
    );
    await client.query(`DELETE FROM login_attempts`);

    // 3. Reset order counter
    await client.query(
      `INSERT INTO order_counters (restaurant_id, last_order_number, updated_at)
       VALUES ($1, 0, NOW())
       ON CONFLICT (restaurant_id)
       DO UPDATE SET last_order_number = 0, updated_at = NOW()`,
      [restaurantId]
    );

    // 4. Ensure Table 7 has qr_token = 'demo-table-7'
    await client.query(
      `UPDATE tables SET qr_token = 'demo-table-7', is_active = true, updated_at = NOW()
       WHERE restaurant_id = $1 AND table_number = 'Table 7'`,
      [restaurantId]
    );

    // 5. Fetch sample tables & menu items to seed 2 clean baseline tickets
    const tablesRes = await client.query(
      "SELECT id, table_number FROM tables WHERE restaurant_id = $1 ORDER BY table_number ASC LIMIT 12",
      [restaurantId]
    );
    const itemsRes = await client.query(
      "SELECT id, name, price_paise FROM menu_items WHERE restaurant_id = $1 ORDER BY created_at ASC LIMIT 6",
      [restaurantId]
    );

    if (tablesRes.rows.length > 0 && itemsRes.rows.length > 0) {
      const availableTables = tablesRes.rows;
      const sampleMenuItems = itemsRes.rows;
      const now = new Date();

      // Seed Order 1: Accepted (Table 3)
      const table3 =
        availableTables.find((t: { table_number: string }) => t.table_number === "Table 3") ||
        availableTables[0];
      const item1 = sampleMenuItems[0];
      const item2 = sampleMenuItems[1] || item1;
      const subtotal1 = Number(item1.price_paise) * 2 + Number(item2.price_paise);
      const tax1 = Math.round(subtotal1 * 0.05);

      const order1Id = crypto.randomUUID();
      await client.query(
        `INSERT INTO orders (
          id, restaurant_id, table_id, order_number, status, payment_status, payment_method,
          subtotal_paise, tax_paise, total_paise, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          order1Id,
          restaurantId,
          table3.id,
          "ML-0001",
          "accepted",
          "paid",
          "pay_now",
          subtotal1,
          tax1,
          subtotal1 + tax1,
          new Date(now.getTime() - 8 * 60 * 1000),
        ]
      );

      await client.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, item_name, item_price_paise, quantity, total_paise)
         VALUES
         ($1, $2, $3, $4, $5, 2, $6),
         ($7, $2, $8, $9, $10, 1, $10)`,
        [
          crypto.randomUUID(),
          order1Id,
          item1.id,
          item1.name,
          Number(item1.price_paise),
          Number(item1.price_paise) * 2,
          crypto.randomUUID(),
          item2.id,
          item2.name,
          Number(item2.price_paise),
        ]
      );

      await client.query(
        `INSERT INTO order_events (id, order_id, from_status, to_status, note, created_at)
         VALUES ($1, $2, 'placed', 'accepted', 'Initial test ticket', $3)`,
        [crypto.randomUUID(), order1Id, new Date(now.getTime() - 7 * 60 * 1000)]
      );

      // Seed Order 2: Preparing (Table 7)
      const table7 =
        availableTables.find((t: { table_number: string }) => t.table_number === "Table 7") ||
        availableTables[0];
      const item3 = sampleMenuItems[2] || item1;
      const subtotal2 = Number(item3.price_paise);
      const tax2 = Math.round(subtotal2 * 0.05);

      const order2Id = crypto.randomUUID();
      await client.query(
        `INSERT INTO orders (
          id, restaurant_id, table_id, order_number, status, payment_status, payment_method,
          subtotal_paise, tax_paise, total_paise, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          order2Id,
          restaurantId,
          table7.id,
          "ML-0002",
          "preparing",
          "counter",
          "pay_counter",
          subtotal2,
          tax2,
          subtotal2 + tax2,
          new Date(now.getTime() - 4 * 60 * 1000),
        ]
      );

      await client.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, item_name, item_price_paise, quantity, total_paise)
         VALUES ($1, $2, $3, $4, $5, 1, $5)`,
        [crypto.randomUUID(), order2Id, item3.id, item3.name, Number(item3.price_paise)]
      );

      await client.query(
        `INSERT INTO order_events (id, order_id, from_status, to_status, note, created_at)
         VALUES ($1, $2, 'accepted', 'preparing', 'Kitchen started preparation', $3)`,
        [crypto.randomUUID(), order2Id, new Date(now.getTime() - 3 * 60 * 1000)]
      );

      // Set order counter to 2
      await client.query(
        `INSERT INTO order_counters (restaurant_id, last_order_number, updated_at)
         VALUES ($1, 2, NOW())
         ON CONFLICT (restaurant_id)
         DO UPDATE SET last_order_number = 2, updated_at = NOW()`,
        [restaurantId]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}
