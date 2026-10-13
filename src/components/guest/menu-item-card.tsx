"use client";

import * as React from "react";
import Image from "next/image";
import { formatPaiseToINR } from "@/lib/currency";
import { VegIndicator } from "./veg-indicator";
import { Badge } from "@/components/ui/badge";
import { Clock, Plus, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuestMenuItem } from "@/server/queries/guest";

export interface MenuItemCardProps {
  item: GuestMenuItem;
  onSelect: (item: GuestMenuItem) => void;
}

export function MenuItemCard({ item, onSelect }: MenuItemCardProps) {
  const isAvailable = item.isAvailable;
  const hasModifiers = item.modifiers.length > 0;
  const [imageError, setImageError] = React.useState(false);

  return (
    <article
      onClick={() => {
        if (isAvailable) onSelect(item);
      }}
      className={cn(
        "group relative flex flex-col rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-[var(--shadow-card)] transition-all",
        isAvailable
          ? "cursor-pointer hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-elevated)] active:scale-[0.99]"
          : "opacity-60 cursor-not-allowed bg-[var(--bg-subtle)]/50"
      )}
    >
      {/* 4:3 Image on Top with Subtle Desktop Hover Zoom & Fixed Aspect Ratio */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--bg-subtle)]">
        {item.imageUrl && !imageError ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 360px"
            className="object-cover transition-transform duration-500 ease-out sm:group-hover:scale-105 motion-reduce:transform-none"
            onError={() => setImageError(true)}
          />
        ) : (
          /* Graceful Warm Fallback Placeholder */
          <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] text-center text-white/70 p-4">
            <Utensils className="h-8 w-8 opacity-40 text-[#D97706] mb-1.5" />
            <span className="font-serif text-xs italic tracking-wide text-amber-200/80">
              Masala Lane
            </span>
          </div>
        )}

        {/* Subtle dark gradient overlay at top and bottom for badge contrast */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />

        {/* Veg Indicator on Image Corner */}
        <div className="absolute top-3 left-3 z-10 p-1 rounded-sm bg-white/95 backdrop-blur-xs shadow-xs">
          <VegIndicator isVeg={item.isVeg} size="sm" />
        </div>

        {/* Badges on Top Right Corner */}
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          {hasModifiers && isAvailable && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/60 text-amber-300 backdrop-blur-xs border border-white/20">
              Customizable
            </span>
          )}
          {!isAvailable && (
            <Badge variant="destructive" size="sm" className="text-[10px] font-bold shadow-xs">
              Sold Out
            </Badge>
          )}
        </div>

        {!isAvailable && (
          <div className="pointer-events-none absolute inset-0 bg-black/35 flex items-center justify-center">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-white/90 bg-black/70 px-3 py-1 rounded-full border border-white/20">
              Currently Unavailable
            </span>
          </div>
        )}
      </div>

      {/* Card Details */}
      <div className="flex flex-1 flex-col justify-between p-4 gap-3">
        <div className="space-y-1">
          <h3 className="font-serif text-lg font-bold leading-snug text-[var(--text-primary)] group-hover:text-[var(--primary)] transition-colors">
            {item.name}
          </h3>

          {item.description && (
            <p className="line-clamp-2 text-xs text-[var(--text-secondary)] leading-relaxed">
              {item.description}
            </p>
          )}
        </div>

        {/* Price, Prep Time, and Circular '+' Button on One Row */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]/70">
          <div className="flex items-baseline gap-2">
            <span className="font-sans text-base font-bold text-[var(--primary)]">
              {formatPaiseToINR(item.pricePaise)}
            </span>
            <span className="flex items-center gap-1 text-[11px] font-mono text-[var(--text-muted)]">
              <Clock className="h-3 w-3" />
              {item.prepTimeMinutes} min
            </span>
          </div>

          {/* Circular '+' Button (min 44px tap target) */}
          <button
            type="button"
            disabled={!isAvailable}
            onClick={(e) => {
              e.stopPropagation();
              if (isAvailable) onSelect(item);
            }}
            aria-label={
              isAvailable ? `Add ${item.name} to order` : `${item.name} is sold out`
            }
            className={cn(
              "h-11 w-11 min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs",
              isAvailable
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] active:scale-95"
                : "bg-[var(--bg-subtle)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
            )}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
