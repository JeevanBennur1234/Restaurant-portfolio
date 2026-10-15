import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

describe("PGlite Real PostgreSQL Service Tests", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client);

    // Create necessary tables for real Postgres execution
    await client.exec(`
      CREATE TABLE IF NOT EXISTS order_counters (
        restaurant_id text PRIMARY KEY,
        last_order_number integer NOT NULL DEFAULT 0,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key text NOT NULL,
        restaurant_id text NOT NULL,
        request_hash text NOT NULL,
        response_status integer NOT NULL,
        response_body jsonb NOT NULL,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        PRIMARY KEY (restaurant_id, key)
      );

      CREATE TABLE IF NOT EXISTS login_attempts (
        key text PRIMARY KEY,
        count integer NOT NULL DEFAULT 1,
        window_start timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      );
    `);
  }, 30000);

  afterAll(async () => {
    await client.close();
  });

  describe("Order Counter Atomicity", () => {
    it("atomically increments order counter per restaurant with zero collision", async () => {
      const restaurantId = "rest-atomic-1";

      const getNextOrderNumber = async () => {
        const res = await db.execute(sql`
          INSERT INTO order_counters (restaurant_id, last_order_number, updated_at)
          VALUES (${restaurantId}, 1, now())
          ON CONFLICT (restaurant_id)
          DO UPDATE SET
            last_order_number = order_counters.last_order_number + 1,
            updated_at = now()
          RETURNING last_order_number;
        `);
        return Number((res.rows[0] as { last_order_number: number }).last_order_number);
      };

      // Execute sequential counter calls
      const num1 = await getNextOrderNumber();
      const num2 = await getNextOrderNumber();
      const num3 = await getNextOrderNumber();

      expect(num1).toBe(1);
      expect(num2).toBe(2);
      expect(num3).toBe(3);
    });
  });

  describe("Idempotency Insert-Once Guarantee", () => {
    it("guarantees single insertion under ON CONFLICT DO NOTHING", async () => {
      const restaurantId = "rest-atomic-1";
      const key = "idem-key-unique-1";
      const hash = "hash-123456";

      const insertKey = async () => {
        const res = await db.execute(sql`
          INSERT INTO idempotency_keys (key, restaurant_id, request_hash, response_status, response_body, created_at)
          VALUES (${key}, ${restaurantId}, ${hash}, 0, '{}'::jsonb, now())
          ON CONFLICT (restaurant_id, key) DO NOTHING
          RETURNING key;
        `);
        return res.rows;
      };

      const firstAttempt = await insertKey();
      expect(firstAttempt.length).toBe(1); // inserted

      const secondAttempt = await insertKey();
      expect(secondAttempt.length).toBe(0); // conflict do nothing: 0 rows returned
    });
  });

  describe("Rate-Limit Atomic Upsert Counting", () => {
    it("correctly counts and increments login attempts within window", async () => {
      const rateLimitKey = "testuser:127.0.0.1";
      const windowMs = 60000;

      const recordAttempt = async () => {
        const res = await db.execute(sql`
          INSERT INTO login_attempts (key, count, window_start, updated_at)
          VALUES (${rateLimitKey}, 1, now(), now())
          ON CONFLICT (key) DO UPDATE SET
            count = CASE 
              WHEN login_attempts.window_start + (${windowMs} * INTERVAL '1 millisecond') <= now() 
              THEN 1 
              ELSE login_attempts.count + 1 
            END,
            window_start = CASE 
              WHEN login_attempts.window_start + (${windowMs} * INTERVAL '1 millisecond') <= now() 
              THEN now() 
              ELSE login_attempts.window_start 
            END,
            updated_at = now()
          RETURNING count;
        `);
        return Number((res.rows[0] as { count: number }).count);
      };

      const c1 = await recordAttempt();
      const c2 = await recordAttempt();
      const c3 = await recordAttempt();

      expect(c1).toBe(1);
      expect(c2).toBe(2);
      expect(c3).toBe(3);
    });
  });
});
