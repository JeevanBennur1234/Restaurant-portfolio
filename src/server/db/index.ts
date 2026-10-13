import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

import { env } from "@/server/env";

const globalForDb = globalThis as unknown as {
  conn: Pool | undefined;
};

const connectionString = env.DATABASE_URL;

const pool =
  globalForDb.conn ??
  new Pool({
    connectionString,
    ssl:
      connectionString.includes("supabase.co") ||
      connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
  });

if (env.NODE_ENV !== "production") {
  globalForDb.conn = pool;
}

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export * from "./schema";
