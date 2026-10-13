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

  if (totalCount === 0) return null;

  return (
    <aside
      aria-label="Current cart summary"
      className="fixed bottom-5 inset-x-4 max-w-md mx-auto z-40 animate-sheet-slide-up"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsCartOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsCartOpen(true);
          }
        }}
        aria-label={`View cart with ${totalCount} items totaling ${formatPaiseToINR(totalPaise)}`}
        className={cn(
          "flex items-center justify-between rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] px-4 sm:px-5 py-3 shadow-[var(--shadow-elevated)] cursor-pointer hover:bg-[var(--primary-hover)] active:scale-[0.98] transition-all min-h-[48px]",
          isBumping && "animate-bump motion-reduce:transform-none"
        )}
      >
        {/* Left Count & Price */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
            <ShoppingBag className="h-4 w-4 text-white" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--secondary)] px-1 text-[10px] font-bold font-mono text-white">
              {totalCount}
            </span>
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-[10px] sm:text-[11px] font-medium tracking-wide uppercase opacity-85 leading-tight truncate">
              {totalCount === 1 ? "1 item added" : `${totalCount} items added`}
            </span>
            <span className="font-mono text-sm sm:text-base font-bold leading-tight truncate">
              {formatPaiseToINR(totalPaise)}
            </span>
          </div>
        </div>

        {/* Right Action Pill */}
        <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm bg-white/15 px-3 py-1.5 rounded-full shrink-0">
          <span>View Cart</span>
          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </div>
      </div>
    </aside>
  );
}
