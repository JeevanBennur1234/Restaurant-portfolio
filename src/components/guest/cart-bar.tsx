"use client";

import * as React from "react";
import { useCart } from "./cart-context";
import { formatPaiseToINR } from "@/lib/currency";
import { ShoppingBag, ArrowRight } from "lucide-react";

export function CartBar() {
  const { totalCount, totalPaise, setIsCartOpen } = useCart();

  if (totalCount === 0) return null;

  return (
    <aside
      aria-label="Current cart summary"
      className="fixed bottom-4 inset-x-4 max-w-md mx-auto z-40 animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      <div
        onClick={() => setIsCartOpen(true)}
        className="flex items-center justify-between rounded-[var(--radius-xl)] bg-[var(--primary)] text-[var(--primary-foreground)] p-3.5 px-5 shadow-[var(--shadow-elevated)] cursor-pointer hover:bg-[var(--primary-hover)] active:scale-[0.99] transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
            <ShoppingBag className="h-4 w-4 text-white" />
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--secondary)] px-1 text-[10px] font-bold font-mono text-white">
              {totalCount}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-medium tracking-wide uppercase opacity-85 leading-tight">
              {totalCount === 1 ? "1 item added" : `${totalCount} items added`}
            </span>
            <span className="font-mono text-base font-bold leading-tight">
              {formatPaiseToINR(totalPaise)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 font-semibold text-sm">
          <span>View Cart</span>
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </aside>
  );
}
