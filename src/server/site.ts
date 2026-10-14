import type { StaffRole } from "@/server/db/schema";
import { env } from "@/server/env";

export type Site = "customer" | "kitchen" | "manager" | "all";

/**
 * Returns current site identity: "customer" | "kitchen" | "manager" | "all".
 * Prioritizes process.env.SITE to allow runtime environment overrides in tests/dev.
 */
export function getSite(): Site {
  const raw = process.env.SITE;
  if (raw === "customer" || raw === "kitchen" || raw === "manager" || raw === "all") {
    return raw;
  }
  return (env?.SITE as Site) ?? "all";
}

/**
 * Checks if current site matches any of the given site identifiers.
 */
export function isSite(...sites: Site[]): boolean {
  return sites.includes(getSite());
}

/**
 * Returns allowed staff roles for a given site.
 * kitchen: kitchen, manager, admin
 * manager: manager, admin
 * customer: none
 * all: kitchen, manager, admin
 */
export function allowedRolesForSite(site: Site = getSite()): StaffRole[] {
  switch (site) {
    case "kitchen":
      return ["kitchen", "manager", "admin"];
    case "manager":
      return ["manager", "admin"];
    case "customer":
      return [];
    case "all":
    default:
      return ["kitchen", "manager", "admin"];
  }
}

/**
 * Returns cookie name used for staff session for a given site.
 * kitchen: "dinepulse_kitchen_session"
 * manager: "dinepulse_manager_session"
 * customer/all: "dinepulse_staff_session"
 */
export function sessionCookieNameForSite(site: Site = getSite()): string {
  switch (site) {
    case "kitchen":
      return "dinepulse_kitchen_session";
    case "manager":
      return "dinepulse_manager_session";
    case "customer":
    case "all":
    default:
      return "dinepulse_staff_session";
  }
}
