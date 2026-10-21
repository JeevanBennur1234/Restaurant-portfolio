"use client";

import * as React from "react";
import Image from "next/image";
import { formatPaiseToINR } from "@/lib/currency";
import { VegIndicator } from "./veg-indicator";
import { Badge } from "@/components/ui/badge";
import { Clock, Flame, Plus, Star, TrendingUp, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuestMenuItem } from "@/lib/api/types";

export interface MenuItemCardProps {
  item: GuestMenuItem;
  searchQuery?: string;
  /** Derived from the menu item's real category slug. */
  isSignature?: boolean;
  onSelect: (item: GuestMenuItem) => void;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return <>{text}</>;

  const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLocaleLowerCase() === normalizedQuery.toLocaleLowerCase() ? (
          <mark
            key={`${index}-${part}`}
            data-search-match="true"
            className="rounded-sm bg-amber-200/80 px-0.5 text-inherit ring-1 ring-amber-400/30"
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function hasSelectableCustomizations(modifiers: GuestMenuItem["modifiers"]): boolean {
  if (!modifiers || modifiers.length === 0) return false;
  const groups = new Map<string, GuestMenuItem["modifiers"]>();
  for (const mod of modifiers) {
    const list = groups.get(mod.groupName) ?? [];
    list.push(mod);
    groups.set(mod.groupName, list);
  }
  for (const groupMods of groups.values()) {
    if (groupMods.length > 1) return true;
    if (groupMods.some((m) => !m.isRequired)) return true;
  }
  return false;
}

export function MenuItemCard({ item, searchQuery = "", isSignature = false, onSelect }: MenuItemCardProps) {
  const isAvailable = item.isAvailable;
  const isCustomizable = hasSelectableCustomizations(item.modifiers);
  const spiceOptions = item.modifiers
    .filter((modifier) => /spice\s*level/i.test(modifier.groupName))
    .map((modifier) => modifier.name);
  const [imageStatus, setImageStatus] = React.useState<{
    src: string | null;
    loading: boolean;
    error: boolean;
  }>(() => ({ src: item.imageUrl ?? null, loading: Boolean(item.imageUrl), error: false }));
  const imageStatusMatches = imageStatus.src === (item.imageUrl ?? null);
  const imageError = imageStatusMatches && imageStatus.error;
  const imageLoading = Boolean(item.imageUrl) && (!imageStatusMatches || imageStatus.loading);

  return (
    <article
      data-testid="menu-item-card"
      className={cn(
        "group relative flex h-full flex-col rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-[var(--shadow-card)] transition-all",
        isAvailable
          ? "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-elevated)] active:scale-[0.99]"
          : "opacity-60 cursor-not-allowed bg-[var(--bg-subtle)]/50"
      )}
    >
      <button
        type="button"
        data-testid="menu-item-details-btn"
        disabled={!isAvailable}
        onClick={() => {
          if (isAvailable) onSelect(item);
        }}
        className={cn(
          "flex w-full min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-inset",
          isAvailable ? "cursor-pointer" : "cursor-not-allowed"
        )}
      >
        {/* 4:3 Image on Top with Subtle Desktop Hover Zoom & Fixed Aspect Ratio */}
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#EFE5D9] sm:aspect-[16/10]">
          {item.imageUrl && !imageError ? (
            <>
              {imageLoading && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-[#E8DED2] via-[#F8F1E8] to-[#E5D7C9] before:absolute before:inset-0 before:animate-pulse before:bg-gradient-to-r before:from-transparent before:via-white/50 before:to-transparent"
                >
                  <Utensils className="h-7 w-7 animate-pulse text-[#A98C76]/70" />
                  <span className="h-2 w-20 animate-pulse rounded-full bg-[#CDBAA8]/70" />
                </div>
              )}
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                priority={item.sortOrder <= 3}
                sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 34vw"
                className={cn(
                  "object-cover transition-[opacity,transform] duration-500 ease-out sm:group-hover:scale-105 motion-reduce:transform-none",
                  imageLoading ? "opacity-0" : "opacity-100"
                )}
                onLoad={() => setImageStatus({ src: item.imageUrl ?? null, loading: false, error: false })}
                onError={() => setImageStatus({ src: item.imageUrl ?? null, loading: false, error: true })}
              />
            </>
          ) : (
            /* Graceful Warm Fallback Placeholder */
            <div data-testid="dish-image-fallback" className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] text-center text-white/70 p-4">
              <Utensils className="h-8 w-8 opacity-40 text-[#D97706] mb-1.5" />
              <span className="max-w-full text-balance font-serif text-center text-xs italic tracking-wide text-amber-200/90">
                {item.name}
              </span>
              <span className="text-[10px] text-white/45">Photo coming soon</span>
            </div>
          )}

          {/* Subtle dark gradient overlay at top and bottom for badge contrast */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />

          {/* Veg Indicator on Image Corner */}
          <div className="absolute top-3 left-3 z-10 p-1 rounded-sm bg-white/95 backdrop-blur-xs shadow-xs">
            <VegIndicator isVeg={item.isVeg} size="sm" />
          </div>

          {/* Metadata-backed recommendation badges */}
          {(isSignature || item.isBestSeller) && (
            <div className="absolute bottom-3 left-3 z-10 flex max-w-[85%] flex-wrap gap-1.5">
              {isSignature && (
                <Badge variant="accent" size="sm" className="gap-1 border border-white/15 bg-[#2E2723]/85 text-amber-100 shadow-sm backdrop-blur-sm">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  Signature
                </Badge>
              )}
              {item.isBestSeller && (
                <Badge variant="success" size="sm" className="gap-1 border border-white/15 bg-emerald-950/85 text-emerald-50 shadow-sm backdrop-blur-sm">
                  <TrendingUp className="h-3 w-3" aria-hidden="true" />
                  Best seller
                </Badge>
              )}
            </div>
          )}

          {/* Badges on Top Right Corner */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {isCustomizable && isAvailable && (
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
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-3 sm:p-4 sm:gap-3">
          <div className="min-w-0 space-y-1.5">
            <h3 className="min-h-[2.75rem] font-serif text-base font-bold leading-snug text-[var(--text-primary)] transition-colors group-hover:text-[var(--primary)] sm:min-h-[3rem] sm:text-lg">
              <HighlightedText text={item.name} query={searchQuery} />
            </h3>

            <p className="min-h-[3.75rem] line-clamp-3 text-xs leading-relaxed text-[var(--text-secondary)] sm:min-h-[4rem] sm:text-[13px]">
              {item.description ? (
                <HighlightedText text={item.description} query={searchQuery} />
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
            <div data-testid="spice-level-slot" className="flex min-h-7 flex-wrap items-center gap-1.5 pt-1.5">
              {spiceOptions.length > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-rose-800" title={"Available spice choices: " + spiceOptions.join(", ")}>
                    <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                    Spice level
                  </span>
                  {spiceOptions.slice(0, 2).map((option) => (
                    <span key={option} className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-900">
                      {option}
                    </span>
                  ))}
                  {spiceOptions.length > 2 && (
                    <span className="text-[10px] text-[var(--text-muted)]">+{spiceOptions.length - 2}</span>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      {/* Price, Prep Time, and Circular '+' Button on One Row */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--border-subtle)]/70 px-3 py-3 sm:px-4 sm:py-4">
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
          data-testid="add-item-btn"
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
    </article>
  );
}
