export const ALLOWED_TEST_DB_HOSTS = [
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "0.0.0.0",
  "mock",
] as const;

export const ALLOWED_TEST_DB_NAMES = [
  "dinepulse_e2e",
  "dinepulse_test",
  "mock",
] as const;

export interface IsolatedDbCheckResult {
  safe: boolean;
  host: string;
  database: string;
  reason?: string;
}

/**
 * Validates that a database URL is an isolated, disposable local test database.
 * Strictly verifies both the host and an explicit test-database name allowlist,
 * failing closed on any unrecognized database configuration, remote host, or Supabase.
 */
export function isIsolatedLocalTestDatabase(rawUrl?: string): IsolatedDbCheckResult {
  if (!rawUrl || !rawUrl.trim()) {
    return {
      safe: false,
      host: "",
      database: "",
      reason: "DATABASE_URL is not configured.",
    };
  }

  const clean = rawUrl.replace(/^["']|["']$/g, "").trim();
  let host = "";
  let database = "";

  try {
    const parsed = new URL(clean);
    host = parsed.hostname.toLowerCase();
    const rawPath = parsed.pathname.replace(/^\//, "").split("?")[0].trim().toLowerCase();
    database = rawPath || (host === "mock" ? "mock" : "");
  } catch {
    // Attempt regex extraction for non-standard or malformed postgres URIs
    const match = clean.match(/@([^:/]+)(?::\d+)?(?:\/([^?]+))?/);
    if (match) {
      host = match[1]?.toLowerCase() || "";
      database = match[2]?.trim().toLowerCase() || "";
    }
  }

  if (!host) {
    return {
      safe: false,
      host: "",
      database: "",
      reason: "Malformed DATABASE_URL: could not resolve database host.",
    };
  }

  // 1. Strictly reject any Supabase hosts
  if (host.includes("supabase")) {
    return {
      safe: false,
      host,
      database,
      reason: `Database host "${host}" contains "supabase". Test operations and simulations are strictly prohibited on Supabase instances.`,
    };
  }

  // 2. Strictly enforce allowed local/test hosts
  const isAllowedHost = (ALLOWED_TEST_DB_HOSTS as readonly string[]).includes(host);

  if (!isAllowedHost) {
    return {
      safe: false,
      host,
      database,
      reason: `Database host "${host}" is not recognized as a safe local test host. Allowed test hosts: ${ALLOWED_TEST_DB_HOSTS.join(", ")}.`,
    };
  }

  // 3. Fail closed if database name is missing
  if (!database) {
    return {
      safe: false,
      host,
      database: "",
      reason: "DATABASE_URL does not specify a database name. A disposable test database name is required.",
    };
  }

  // 4. Strictly enforce test-database name allowlist
  const isAllowedDbName = (ALLOWED_TEST_DB_NAMES as readonly string[]).includes(database);

  if (!isAllowedDbName) {
    return {
      safe: false,
      host,
      database,
      reason: `Database "${database}" is not in the test-database allowlist (${ALLOWED_TEST_DB_NAMES.join(", ")}). Test payment simulation requires a dedicated disposable test database.`,
    };
  }

  return { safe: true, host, database };
}
