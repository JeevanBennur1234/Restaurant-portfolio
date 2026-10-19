// CI test environment defaults - set ONLY when undefined
if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/test";
}
if (process.env.NEXT_PUBLIC_APP_URL === undefined) {
  process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
}
if (process.env.SESSION_SECRET === undefined) {
  process.env.SESSION_SECRET = "test-session-secret-at-least-32-characters-long";
}
if (process.env.PAYMENTS_MODE === undefined) {
  process.env.PAYMENTS_MODE = "online";
}
