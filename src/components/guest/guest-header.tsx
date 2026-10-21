import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Utensils } from "lucide-react";

export interface GuestHeaderProps {
  restaurantName: string;
  tableLabel: string;
}

export function GuestHeader({ restaurantName, tableLabel }: GuestHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/95 px-3 py-2 sm:px-4 sm:py-3 backdrop-blur-md shadow-xs">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--primary-subtle)] text-[var(--primary)] shadow-xs">
          <Utensils className="h-4 w-4" />
        </div>
        <div>
          <h1 className="font-serif text-base sm:text-lg font-bold leading-none tracking-tight text-[var(--text-primary)]">
            {restaurantName}
          </h1>
          <p className="hidden mt-0.5 text-[11px] font-sans text-[var(--text-muted)] tracking-wide uppercase sm:block">
            Digital Table Ordering
          </p>
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-2">
        <Badge
          variant="secondary"
          size="md"
          className="font-mono text-xs font-semibold px-2.5 py-1 bg-[var(--bg-subtle)] text-[var(--text-primary)] border border-[var(--border-subtle)] shadow-xs"
        >
          {tableLabel}
        </Badge>
      </div>
    </header>
  );
}
