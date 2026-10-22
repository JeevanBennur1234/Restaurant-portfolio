"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Utensils, ShoppingBag } from "lucide-react";
import { useOptionalCart } from "./cart-context";
import { formatPaiseToINR } from "@/lib/currency";

export interface GuestHeaderProps {
  restaurantName: string;
  tableLabel: string;
  /** Destination for the brand link; table-ordering pages pass their active QR route. */
  homeHref?: string;
}

export function GuestHeader({ restaurantName, tableLabel, homeHref = "/" }: GuestHeaderProps) {
  const cart = useOptionalCart();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur-md shadow-xs">
      <Link
        href={homeHref}
        data-testid="guest-brand-home-link"
        aria-label={`${restaurantName} Digital Table Ordering home`}
        title={`Back to ${restaurantName}`}
        className="group flex min-w-0 items-center gap-3 rounded-xl py-1 pr-2 transition-colors hover:bg-[var(--bg-subtle)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
      >
        <span className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-full border border-[var(--primary)]/20 bg-[var(--primary-subtle)] text-[var(--primary)] shadow-xs transition-transform group-hover:scale-105">
          <Utensils className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-serif text-xl sm:text-2xl font-bold leading-tight tracking-tight text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
            {restaurantName}
          </span>
          <span className="mt-0.5 hidden text-[11px] sm:text-xs font-sans font-medium text-[var(--text-muted)] tracking-[0.12em] uppercase sm:block">
            Digital Table Ordering
          </span>
        </span>
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="secondary"
          size="md"
          className="font-mono text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1 bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs"
        >
          {tableLabel}
        </Badge>

        {cart && (
          <button
            type="button"
            data-testid="header-cart-btn"
            onClick={() => cart.setIsCartOpen(true)}
            aria-label={
              cart.totalCount === 0
                ? "View empty cart"
                : `View cart with ${cart.totalCount} items totaling ${formatPaiseToINR(cart.totalPaise)}`
            }
            className="relative flex h-8 w-8 sm:h-9 sm:w-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
          >
            <ShoppingBag className="h-4 w-4" />
            {cart.totalCount > 0 && (
              <span
                data-testid="header-cart-count"
                className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold font-mono text-white shadow-xs"
              >
                {cart.totalCount}
              </span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
