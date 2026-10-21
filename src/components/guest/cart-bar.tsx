"use client";

import * as React from "react";
import { useCart } from "./cart-context";
import { formatPaiseToINR } from "@/lib/currency";
import { ShoppingBag, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CartBar() {
  const { totalCount, totalPaise, setIsCartOpen } = useCart();
  const [isBumping, setIsBumping] = React.useState(false);
  const prevCountRef = React.useRef(totalCount);

  // Trigger short bump animation when the item count changes
  React.useEffect(() => {
    if (totalCount > 0 && totalCount !== prevCountRef.current) {
      prevCountRef.current = totalCount;
      setIsBumping(true);
      const timer = setTimeout(() => setIsBumping(false), 260);
      return () => clearTimeout(timer);
    }
    prevCountRef.current = totalCount;
  }, [totalCount]);

  const isEmpty = totalCount === 0;

  return (
    <aside
      aria-label="Current cart summary"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] inset-x-3 z-40 mx-auto max-w-md animate-sheet-slide-up sm:bottom-5 sm:inset-x-4"
    >
      <button
        type="button"
        data-testid="cart-bar-btn"
        onClick={() => {
          if (isEmpty) {
            const browseTarget =
              document.querySelector('[id^="category-section-"]') ??
              document.querySelector('[data-testid="menu-search-input"]');
            browseTarget?.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              block: "start",
            });
            return;
          }
          setIsCartOpen(true);
        }}
        aria-label={isEmpty ? "Browse dishes" : `View cart with ${totalCount} items totaling ${formatPaiseToINR(totalPaise)}`}
        className={cn(
          "flex items-center justify-between gap-3 rounded-full text-left transition-all active:scale-[0.98]",
          isEmpty
            ? "mx-auto min-h-10 w-fit border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-4 py-2 text-[var(--text-secondary)] shadow-sm hover:bg-[var(--bg-subtle)]"
            : "min-h-[52px] w-full border-0 bg-[var(--primary)] px-3.5 py-2.5 text-[var(--primary-foreground)] shadow-[var(--shadow-elevated)] hover:bg-[var(--primary-hover)] sm:px-5",
          isBumping && "animate-bump motion-reduce:transform-none"
        )}
      >
        {/* Left Count & Price */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full", isEmpty ? "bg-[var(--bg-subtle)]" : "bg-white/20", isEmpty && "hidden")}>
            <ShoppingBag className={cn("h-4 w-4", isEmpty ? "text-[var(--primary)]" : "text-white")} />
            <span className={cn("absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold font-mono", isEmpty ? "bg-[var(--border-strong)] text-[var(--text-primary)]" : "bg-[var(--secondary)] text-white")}>
              {totalCount}
            </span>
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[10px] font-medium uppercase tracking-wide leading-tight opacity-85 sm:text-[11px]">
              {isEmpty ? "Browse dishes" : totalCount === 1 ? "1 item added" : `${totalCount} items added`}
            </span>
            <span className={cn("truncate text-xs font-semibold leading-tight sm:text-sm", isEmpty && "hidden")}>
              {isEmpty ? "Choose dishes to begin" : `${formatPaiseToINR(totalPaise)} · ${totalCount} ${totalCount === 1 ? "item" : "items"}`}
            </span>
          </div>
        </div>

        {/* Right Action Pill */}
        <div className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:text-sm", isEmpty ? "bg-[var(--bg-subtle)] text-[var(--text-primary)]" : "bg-white/15", isEmpty && "hidden")}>
          <span>{isEmpty ? "Browse" : "View Cart"}</span>
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </button>
    </aside>
  );
}
