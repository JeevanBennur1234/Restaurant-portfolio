import type { PoolConfig } from "pg";
import { env } from "@/server/env";

/**
 * Returns consistent PostgreSQL connection pool configuration.
 * Applies SSL rules matching the application environment.
 */
export function getPoolConfig(
  connectionString: string = env.DATABASE_URL
): PoolConfig {
  const needsSsl =
    connectionString.includes("supabase.co") ||
    connectionString.includes("sslmode=require");

  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  };
}

export const poolConfig: PoolConfig = getPoolConfig();
