const TABLE_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/** Extract a table token from a token string or a QR URL whose path is exactly /t/{token}. */
export function extractTableTokenFromQr(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  let candidate = raw;
  if (raw.startsWith("/") || /^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw, "https://table-qr.invalid");
      const match = parsed.pathname.match(/^\/t\/([^/]+)\/?$/);
      if (!match?.[1]) return null;
      candidate = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }

  return TABLE_TOKEN_PATTERN.test(candidate) ? candidate : null;
}
