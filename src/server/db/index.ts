import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const connectionString = process.env.DATABASE_URL;

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.conn = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export * from "./schema";
