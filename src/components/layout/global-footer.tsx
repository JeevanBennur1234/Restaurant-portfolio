"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * Route-aware global footer.
 * Suppresses the concept preview footer on customer table-menu routes (/t/...)
 * where it is inappropriate for a real-table dining experience, and on the landing
 * page (/) which features its own rich editorial footer.
 */
export function GlobalFooter() {
  const pathname = usePathname();

  // Hide on customer table routes and the homepage (which has its own full footer)
  if (
    !pathname ||
    pathname.startsWith("/t/") ||
    pathname === "/t" ||
    pathname === "/"
  ) {
    return null;
  }

  return (
    <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-4 text-center text-[11px] font-medium text-[var(--text-secondary)]">
      <p>
        Concept preview by{" "}
        <a
          href="https://intallo.in"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-[var(--primary)] underline underline-offset-4 transition-colors"
          style={{ textDecorationLine: "underline" }}
        >
          Intallo
        </a>
      </p>
    </footer>
  );
}
