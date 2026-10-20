import type { PoolConfig } from "pg";
import { env } from "@/server/env";

/**
 * Returns consistent PostgreSQL connection pool configuration.
 * - Configures bounded connection timeouts, pool size, and idle timeout.
 * - Ensures production database TLS certificate verification is secure
 *   without breaking supported Supabase connections.
 */
export function getPoolConfig(
  connectionString: string = env.DATABASE_URL
): PoolConfig {
  const isProduction = (process.env.NODE_ENV || env.NODE_ENV) === "production";

  const isSupabase =
    connectionString.includes("supabase.co") ||
    connectionString.includes("supabase.com") ||
    connectionString.includes("pooler.supabase");

  const hasSslParam =
    connectionString.includes("sslmode=require") ||
    connectionString.includes("sslmode=verify-full") ||
    connectionString.includes("sslmode=verify-ca") ||
    connectionString.includes("ssl=true");

  const needsSsl =
    isSupabase ||
    hasSslParam ||
    (isProduction &&
      !connectionString.includes("localhost") &&
      !connectionString.includes("127.0.0.1") &&
      !connectionString.includes("mock"));

  // In production, rejectUnauthorized defaults to true for secure TLS certificate verification.
  // Can be explicitly overridden with DATABASE_SSL_REJECT_UNAUTHORIZED if needed.
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== undefined
      ? process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
      : isProduction;

  const ssl = needsSsl
    ? {
        rejectUnauthorized,
        ...(process.env.DATABASE_CA_CERT
          ? { ca: process.env.DATABASE_CA_CERT }
          : {}),
      }
    : undefined;

  const max = process.env.DB_POOL_MAX
    ? parseInt(process.env.DB_POOL_MAX, 10)
    : isProduction
      ? 20
      : 10;

  const connectionTimeoutMillis = process.env.DB_CONNECTION_TIMEOUT_MS
    ? parseInt(process.env.DB_CONNECTION_TIMEOUT_MS, 10)
    : 5000;

  const idleTimeoutMillis = process.env.DB_IDLE_TIMEOUT_MS
    ? parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10)
    : 30000;

  return {
    connectionString,
    ssl,
    max,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    allowExitOnIdle: true,
  };
}

export const poolConfig: PoolConfig = getPoolConfig();
