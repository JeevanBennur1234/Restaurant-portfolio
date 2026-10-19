export type SiteIdentifier = "customer" | "kitchen" | "manager" | "all";

export interface SiteUrls {
  customer: string | null;
  kitchen: string | null;
  manager: string | null;
}

/**
 * Validates that a string is an absolute HTTP/HTTPS origin without path, query, hash, or credentials.
 */
export function validateSiteUrlOrigin(val: string | undefined | null): {
  valid: boolean;
  error?: string;
  origin?: string;
} {
  if (!val || typeof val !== "string" || val.trim() === "") {
    return { valid: true };
  }
  try {
    const url = new URL(val.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        valid: false,
        error: `Site URL must start with http:// or https://: "${val}"`,
      };
    }
    if (url.search || url.hash || url.username || url.password) {
      return {
        valid: false,
        error: `Site URL must not contain query parameters, hashes, or credentials: "${val}"`,
      };
    }
    if (url.pathname !== "" && url.pathname !== "/") {
      return {
        valid: false,
        error: `Site URL must be an absolute origin without a path: "${val}"`,
      };
    }
    return { valid: true, origin: url.origin };
  } catch {
    return {
      valid: false,
      error: `Invalid URL origin format for site URL: "${val}"`,
    };
  }
}

/**
 * Gets the configured absolute origin for a given target site, or null if unconfigured.
 */
export function getSiteOrigin(target: "customer" | "kitchen" | "manager"): string | null {
  const envMap: Record<"customer" | "kitchen" | "manager", string | undefined> = {
    customer: process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL,
    kitchen: process.env.NEXT_PUBLIC_KITCHEN_SITE_URL,
    manager: process.env.NEXT_PUBLIC_MANAGER_SITE_URL,
  };
  const res = validateSiteUrlOrigin(envMap[target]);
  return res.valid && res.origin ? res.origin : null;
}

/**
 * Resolves base URLs for the three DinePulse site surfaces:
 * - When running in unified mode (SITE=all), returns relative paths:
 *   customer: "/", kitchen: "/kitchen", manager: "/admin"
 * - In multi-site mode (SITE=customer|kitchen|manager), returns the configured absolute origin or null.
 *   Does NOT silently default to localhost ports when the target URL is absent.
 */
export function getSiteUrls(currentSite?: SiteIdentifier): SiteUrls {
  const activeSite = currentSite || (process.env.SITE as SiteIdentifier) || "all";

  if (activeSite === "all") {
    return {
      customer: "/",
      kitchen: "/kitchen",
      manager: "/admin",
    };
  }

  return {
    customer: getSiteOrigin("customer"),
    kitchen: getSiteOrigin("kitchen"),
    manager: getSiteOrigin("manager"),
  };
}

/**
 * Resolves an absolute or relative target URL for navigation or embedding.
 * - If SITE=all, returns the specified relative path.
 * - If a target URL is configured, resolves it with the requested path.
 * - Otherwise returns null.
 */
export function resolveSiteUrl(
  target: "customer" | "kitchen" | "manager",
  path = "",
  currentSite?: SiteIdentifier
): string | null {
  const activeSite = currentSite || (process.env.SITE as SiteIdentifier) || "all";

  if (activeSite === "all") {
    const defaultRoots: Record<"customer" | "kitchen" | "manager", string> = {
      customer: "/",
      kitchen: "/kitchen",
      manager: "/admin",
    };
    const base = defaultRoots[target];
    if (!path || path === "/" || path === base) return base;
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    if (base === "/") return cleanPath;
    if (cleanPath.startsWith(base)) return cleanPath;
    return `${base}${cleanPath}`;
  }

  const origin = getSiteOrigin(target);
  if (!origin) {
    return null;
  }

  if (!path) return origin;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${cleanPath}`;
}
