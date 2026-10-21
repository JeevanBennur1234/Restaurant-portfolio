"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Utensils, ShoppingBag } from "lucide-react";
import { useOptionalCart } from "./cart-context";
import { formatPaiseToINR } from "@/lib/currency";

export interface GuestHeaderProps {
  restaurantName: string;
  tableLabel: string;
}

export function GuestHeader({ restaurantName, tableLabel }: GuestHeaderProps) {
  const cart = useOptionalCart();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur-md shadow-xs">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] shadow-xs">
          <Utensils className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="font-serif text-base sm:text-lg font-bold leading-none tracking-tight text-[var(--text-primary)] truncate">
            {restaurantName}
          </h1>
          <p className="hidden mt-0.5 text-[11px] font-sans text-[var(--text-muted)] tracking-wide uppercase sm:block">
            Digital Table Ordering
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge
          variant="secondary"
          size="md"
          className="font-mono text-xs font-semibold px-2 sm:px-2.5 py-1 bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs"
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
