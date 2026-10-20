import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPoolConfig } from "@/server/db/pool-config";
import { PGlite } from "@electric-sql/pglite";
import * as fs from "fs";
import * as path from "path";

describe("Database Pool & TLS Configuration (pool-config)", () => {
  const envMap = process.env as Record<string, string | undefined>;
  const originalEnv = envMap.NODE_ENV;
  const originalSslReject = envMap.DATABASE_SSL_REJECT_UNAUTHORIZED;
  const originalCaCert = envMap.DATABASE_CA_CERT;
  const originalPoolMax = envMap.DB_POOL_MAX;
  const originalConnTimeout = envMap.DB_CONNECTION_TIMEOUT_MS;
  const originalIdleTimeout = envMap.DB_IDLE_TIMEOUT_MS;

  const restoreEnv = () => {
    if (originalEnv !== undefined) envMap.NODE_ENV = originalEnv;
    else delete envMap.NODE_ENV;

    if (originalSslReject !== undefined) envMap.DATABASE_SSL_REJECT_UNAUTHORIZED = originalSslReject;
    else delete envMap.DATABASE_SSL_REJECT_UNAUTHORIZED;

    if (originalCaCert !== undefined) envMap.DATABASE_CA_CERT = originalCaCert;
    else delete envMap.DATABASE_CA_CERT;

    if (originalPoolMax !== undefined) envMap.DB_POOL_MAX = originalPoolMax;
    else delete envMap.DB_POOL_MAX;

    if (originalConnTimeout !== undefined) envMap.DB_CONNECTION_TIMEOUT_MS = originalConnTimeout;
    else delete envMap.DB_CONNECTION_TIMEOUT_MS;

    if (originalIdleTimeout !== undefined) envMap.DB_IDLE_TIMEOUT_MS = originalIdleTimeout;
    else delete envMap.DB_IDLE_TIMEOUT_MS;
  };

  it("configures bounded timeouts, pool size, and idle timeout", () => {
    restoreEnv();
    const config = getPoolConfig("postgres://user:pass@localhost:5432/dinepulse_dev");

    expect(config.max).toBe(10);
    expect(config.connectionTimeoutMillis).toBe(5000);
    expect(config.idleTimeoutMillis).toBe(30000);
    expect(config.allowExitOnIdle).toBe(true);
  });

  it("allows environment variable overrides for pool bounds", () => {
    envMap.DB_POOL_MAX = "25";
    envMap.DB_CONNECTION_TIMEOUT_MS = "8000";
    envMap.DB_IDLE_TIMEOUT_MS = "45000";

    const config = getPoolConfig("postgres://user:pass@localhost:5432/dinepulse_dev");

    expect(config.max).toBe(25);
    expect(config.connectionTimeoutMillis).toBe(8000);
    expect(config.idleTimeoutMillis).toBe(45000);

    restoreEnv();
  });

  it("uses TLS for Supabase and defaults to encryption without CA verification", () => {
    envMap.NODE_ENV = "production";
    delete envMap.DATABASE_SSL_REJECT_UNAUTHORIZED;
    delete envMap.DATABASE_CA_CERT;

    // Supabase's standard sslmode=require behavior encrypts traffic but does not
    // verify the certificate chain. A configured CA certificate enables verification.
    const directSupabase = getPoolConfig("postgres://postgres:secret@db.xyz.supabase.co:5432/postgres");
    expect(directSupabase.ssl).toBeDefined();
    expect((directSupabase.ssl as { rejectUnauthorized?: boolean })?.rejectUnauthorized).toBe(false);

    const poolerSupabase = getPoolConfig("postgres://postgres.xyz:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres");
    expect(poolerSupabase.ssl).toBeDefined();
    expect((poolerSupabase.ssl as { rejectUnauthorized?: boolean })?.rejectUnauthorized).toBe(false);

    const otherProductionDb = getPoolConfig("postgres://app:secret@db.example.com:5432/app");
    expect((otherProductionDb.ssl as { rejectUnauthorized?: boolean })?.rejectUnauthorized).toBe(true);

    restoreEnv();
  });

  it("respects explicit DATABASE_SSL_REJECT_UNAUTHORIZED override", () => {
    envMap.NODE_ENV = "production";
    envMap.DATABASE_SSL_REJECT_UNAUTHORIZED = "false";

    const config = getPoolConfig("postgres://postgres:secret@db.xyz.supabase.co:5432/postgres");
    expect((config.ssl as { rejectUnauthorized?: boolean })?.rejectUnauthorized).toBe(false);

    restoreEnv();
  });

  it("does not require SSL for local development databases", () => {
    envMap.NODE_ENV = "development";
    const config = getPoolConfig("postgres://postgres:postgres@localhost:5432/dinepulse_dev");
    expect(config.ssl).toBeUndefined();

    restoreEnv();
  });
});

describe("Real PostgreSQL Constraints via PGlite", () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();

    // Read and execute initial schema migrations
    const migration0 = fs.readFileSync(path.join(__dirname, "../drizzle/0000_many_ego.sql"), "utf8");
    const migration1 = fs.readFileSync(path.join(__dirname, "../drizzle/0001_freezing_mentallo.sql"), "utf8");
    const migration3 = fs.readFileSync(path.join(__dirname, "../drizzle/0003_lyrical_korvac.sql"), "utf8");
    const migration4 = fs.readFileSync(path.join(__dirname, "../drizzle/0004_cynical_hobgoblin.sql"), "utf8");

    // Execute statements sequentially
    for (const sqlFile of [migration0, migration1, migration3, migration4]) {
      const statements = sqlFile
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        await client.exec(stmt);
      }
    }

    // Insert test restaurant and category
    await client.exec(`
      INSERT INTO restaurants (id, name, slug)
      VALUES ('rest_c1', 'Constraint Kitchen', 'constraint-kitchen');

      INSERT INTO categories (id, restaurant_id, name, slug)
      VALUES ('cat_c1', 'rest_c1', 'Mains', 'mains');
    `);
  });

  afterAll(async () => {
    await client.close();
  });

  it("enforces active table-number uniqueness per restaurant, allowing duplicate table numbers if inactive", async () => {
    // Insert Table 1 (active)
    await client.exec(`
      INSERT INTO tables (id, restaurant_id, table_number, qr_token, is_active)
      VALUES ('t1', 'rest_c1', 'Table 1', 'token_t1', true);
    `);

    // Attempting to insert another active 'Table 1' for same restaurant must fail unique constraint
    await expect(
      client.exec(`
        INSERT INTO tables (id, restaurant_id, table_number, qr_token, is_active)
        VALUES ('t2', 'rest_c1', 'Table 1', 'token_t2', true);
      `)
    ).rejects.toThrow();

    // Inserting an INACTIVE 'Table 1' (soft-deleted) for same restaurant must succeed
    await client.exec(`
      INSERT INTO tables (id, restaurant_id, table_number, qr_token, is_active)
      VALUES ('t3', 'rest_c1', 'Table 1', 'token_t3', false);
    `);

    // Inserting 'Table 1' for a DIFFERENT restaurant must succeed
    await client.exec(`
      INSERT INTO restaurants (id, name, slug) VALUES ('rest_c2', 'Other Restaurant', 'other-rest');
      INSERT INTO tables (id, restaurant_id, table_number, qr_token, is_active)
      VALUES ('t4', 'rest_c2', 'Table 1', 'token_t4', true);
    `);
  });

  it("enforces CHECK constraints for positive table capacity", async () => {
    await expect(
      client.exec(`
        INSERT INTO tables (id, restaurant_id, table_number, qr_token, capacity, is_active)
        VALUES ('t_bad_cap', 'rest_c1', 'Table 99', 'token_bad_cap', 0, true);
      `)
    ).rejects.toThrow(/tables_capacity_positive/i);
  });

  it("enforces CHECK constraints for nonnegative menu_items price_paise", async () => {
    await expect(
      client.exec(`
        INSERT INTO menu_items (id, restaurant_id, category_id, name, price_paise)
        VALUES ('item_neg', 'rest_c1', 'cat_c1', 'Negative Dish', -500);
      `)
    ).rejects.toThrow(/menu_items_price_paise_nonnegative/i);
  });

  it("enforces CHECK constraints for positive order_items quantity", async () => {
    await client.exec(`
      INSERT INTO orders (id, restaurant_id, table_id, order_number, subtotal_paise, tax_paise, total_paise)
      VALUES ('ord_c1', 'rest_c1', 't1', 'ML-C01', 5000, 250, 5250);
    `);

    // Zero quantity must fail
    await expect(
      client.exec(`
        INSERT INTO order_items (id, order_id, item_name, item_price_paise, quantity, total_paise)
        VALUES ('oi_zero', 'ord_c1', 'Zero item', 500, 0, 0);
      `)
    ).rejects.toThrow(/order_items_quantity_positive/i);

    // Negative quantity must fail
    await expect(
      client.exec(`
        INSERT INTO order_items (id, order_id, item_name, item_price_paise, quantity, total_paise)
        VALUES ('oi_neg', 'ord_c1', 'Negative item', 500, -2, -1000);
      `)
    ).rejects.toThrow(/order_items_quantity_positive/i);
  });

  it("enforces CHECK constraints for nonnegative orders totals and payments amount_paise", async () => {
    // Negative order total must fail
    await expect(
      client.exec(`
        INSERT INTO orders (id, restaurant_id, table_id, order_number, subtotal_paise, tax_paise, total_paise)
        VALUES ('ord_neg', 'rest_c1', 't1', 'ML-NEG', -100, 0, -100);
      `)
    ).rejects.toThrow(/orders_subtotal_paise_nonnegative/i);

    // Negative payment amount must fail
    await expect(
      client.exec(`
        INSERT INTO payments (id, order_id, restaurant_id, amount_paise)
        VALUES ('pay_neg', 'ord_c1', 'rest_c1', -5000);
      `)
    ).rejects.toThrow(/payments_amount_paise_nonnegative/i);
  });
});
