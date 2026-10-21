"use client";

import * as React from "react";
import Image from "next/image";
import { formatPaiseToINR } from "@/lib/currency";
import { VegIndicator } from "./veg-indicator";
import { Badge } from "@/components/ui/badge";
import { Clock, Flame, Minus, Plus, Star, TrendingUp, Utensils, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptionalCart } from "./cart-context";
import type { GuestMenuItem } from "@/lib/api/types";

export interface MenuItemCardProps {
  item: GuestMenuItem;
  searchQuery?: string;
  /** Derived from the menu item's real category slug. */
  isSignature?: boolean;
  /** Optional hero card styling for the first dish in a shopfront on desktop */
  isHero?: boolean;
  /** Explicit image loading priority override */
  priority?: boolean;
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
            className="rounded-xs bg-amber-300/90 px-0.5 text-stone-900 ring-1 ring-amber-400/40"
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

function getSpiceMeter(item: GuestMenuItem): { flames: number; label: string } {
  const spiceModifiers = item.modifiers.filter((modifier) => /spice/i.test(modifier.groupName));
  const text = `${item.name} ${item.description ?? ""} ${spiceModifiers.map((modifier) => modifier.name).join(" ")}`.toLowerCase();

  if (/extra fiery|guntur|teja|fiery|naga|vindaloo|ghost|extra hot/i.test(text)) {
    return { flames: 3, label: "Fiery" };
  }
  if (/regular|medium|spicy|masala|kadai|peppercorn|mirch|tandoori|chilli|sigdi/i.test(text)) {
    return { flames: 2, label: "Medium" };
  }
  if (/mild|delicate|creamy|buttery|malai|korma|cashew|jeera|dal/i.test(text)) {
    return { flames: 1, label: "Mild" };
  }
  if (/kheer|kulfi|sweet|jamun|lassi|sharbat|halwa|phirni|dessert/i.test(text)) {
    return { flames: 0, label: "Mild" };
  }
  return { flames: 1, label: "Mild" };
}

export function MenuItemCard({
  item,
  searchQuery = "",
  isSignature = false,
  isHero = false,
  onSelect,
}: MenuItemCardProps) {
  const isAvailable = item.isAvailable;
  const isCustomizable = hasSelectableCustomizations(item.modifiers);
  const spiceInfo = React.useMemo(() => getSpiceMeter(item), [item]);

  const [imageStatus, setImageStatus] = React.useState<{
    src: string | null;
    loading: boolean;
    error: boolean;
  }>(() => ({ src: item.imageUrl ?? null, loading: Boolean(item.imageUrl), error: false }));

  const imageStatusMatches = imageStatus.src === (item.imageUrl ?? null);
  const imageError = imageStatusMatches && imageStatus.error;
  const imageLoading = Boolean(item.imageUrl) && (!imageStatusMatches || imageStatus.loading);

  const cart = useOptionalCart();
  const cartItems = React.useMemo(() => {
    if (!cart) return [];
    return cart.items.filter((ci) => ci.menuItemId === item.id);
  }, [cart, item.id]);

  const totalQuantityInCart = React.useMemo(() => {
    return cartItems.reduce((sum, ci) => sum + ci.quantity, 0);
  }, [cartItems]);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAvailable) return;

    if (isCustomizable || !cart) {
      onSelect(item);
    } else {
      const defaultModIds: string[] = [];
      const groups = new Map<string, typeof item.modifiers>();
      for (const m of item.modifiers) {
        const list = groups.get(m.groupName) ?? [];
        list.push(m);
        groups.set(m.groupName, list);
      }
      for (const mods of groups.values()) {
        if (mods.some((m) => m.isRequired) && mods.length > 0) {
          defaultModIds.push(mods[0].id);
        }
      }
      cart.addItem(item.id, 1, defaultModIds);
    }
  };

  const handleDecrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cart) return;
    if (cartItems.length === 1) {
      cart.updateQuantity(cartItems[0].id, -1);
    } else if (cartItems.length > 1) {
      cart.updateQuantity(cartItems[cartItems.length - 1].id, -1);
    }
  };

  const handleIncrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cart) return;
    if (isCustomizable) {
      onSelect(item);
    } else {
      if (cartItems.length > 0) {
        cart.updateQuantity(cartItems[0].id, 1);
      } else {
        cart.addItem(item.id, 1, []);
      }
    }
  };

  return (
    <article
      data-testid="menu-item-card"
      className={cn(
        "group relative flex h-full flex-col rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-[var(--shadow-card)] transition-all duration-300",
        isHero
          ? "border-amber-900/30 ring-1 ring-amber-500/20 shadow-md"
          : "hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-elevated)]",
        isAvailable
          ? "active:scale-[0.99] cursor-pointer"
          : "opacity-65 cursor-not-allowed bg-[var(--bg-subtle)]/50"
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
          "relative flex w-full min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-inset",
          isAvailable ? "cursor-pointer" : "cursor-not-allowed"
        )}
      >
        {/* Full-Bleed Tall Poster Card (4:5 Ratio on Mobile, Responsive on Desktop) */}
        <div
          className={cn(
            "relative w-full overflow-hidden bg-[#2E2723]",
            isHero
              ? "aspect-[16/9] sm:aspect-[16/10] lg:aspect-[4/3]"
              : "aspect-[4/5]"
          )}
        >
          {item.imageUrl && !imageError ? (
            <>
              {imageLoading && (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-[#2E2723] via-[#3A312B] to-[#1F1A17] before:absolute before:inset-0 before:animate-pulse before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent"
                >
                  <Utensils className="h-8 w-8 animate-pulse text-amber-500/60" />
                  <span className="h-2 w-24 animate-pulse rounded-full bg-amber-400/20" />
                </div>
              )}
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                priority={item.sortOrder <= 3}
                sizes="(max-width: 639px) 280px, (max-width: 1023px) 50vw, 33vw"
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
            <div
              data-testid="dish-image-fallback"
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] text-center text-white/80 p-5"
            >
              <Utensils className="h-10 w-10 opacity-40 text-amber-500 mb-2" />
              <span className="max-w-full text-balance font-serif text-center text-sm font-medium tracking-wide text-amber-200">
                {item.name}
              </span>
              <span className="text-[11px] text-stone-400 mt-1">Photo coming soon</span>
            </div>
          )}

          {/* Deep Atmosphere Overlays for WCAG AA Contrast */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#140F0C] via-[#1F1A17]/75 via-50% to-black/25" />

          {/* Top-Left: Veg Indicator & Recommendation Badge */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
            <div className="p-1 rounded-sm bg-white/95 backdrop-blur-xs shadow-xs">
              <VegIndicator isVeg={item.isVeg} size="sm" />
            </div>

            {isSignature && (
              <Badge
                variant="accent"
                size="sm"
                className="gap-1 border border-amber-400/30 bg-[#2E2723]/90 text-amber-100 shadow-sm backdrop-blur-xs font-serif"
              >
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                Signature
              </Badge>
            )}

            {item.isBestSeller && !isSignature && (
              <Badge
                variant="success"
                size="sm"
                className="gap-1 border border-emerald-400/30 bg-emerald-950/90 text-emerald-100 shadow-sm backdrop-blur-xs"
              >
                <TrendingUp className="h-3 w-3 text-emerald-400" aria-hidden="true" />
                Best seller
              </Badge>
            )}

            {isHero && !isSignature && !item.isBestSeller && (
              <Badge
                variant="secondary"
                size="sm"
                className="gap-1 border border-white/20 bg-black/60 text-amber-200 backdrop-blur-xs"
              >
                <Sparkles className="h-3 w-3 text-amber-300" aria-hidden="true" />
                Shopfront Hero
              </Badge>
            )}
          </div>

          {/* Top-Right: Customizable & Sold Out Badges */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {isCustomizable && isAvailable && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/70 text-amber-300 backdrop-blur-xs border border-white/20">
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
            <div className="pointer-events-none absolute inset-0 bg-black/50 backdrop-blur-2xs flex items-center justify-center">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-white bg-black/80 px-3 py-1.5 rounded-full border border-white/25">
                Currently Unavailable
              </span>
            </div>
          )}

          {/* Bottom Card Overlay Content (Overlaid on Poster Photo) */}
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-3.5 sm:p-4 text-white">
            {/* Metadata Pill: Spice Flame Meter & Prep Time */}
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div data-testid="spice-level-slot" className="flex items-center gap-1">
                {spiceInfo.flames > 0 ? (
                  <div
                    className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 backdrop-blur-xs border border-white/15"
                    title={`Spice Level: ${spiceInfo.label}`}
                  >
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Flame
                          key={i}
                          className={cn(
                            "h-3 w-3 transition-colors",
                            i < spiceInfo.flames
                              ? "text-rose-400 fill-rose-500"
                              : "text-white/25 fill-white/10"
                          )}
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-rose-200">
                      {spiceInfo.label}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-stone-300 uppercase tracking-wide">
                    Delicate
                  </span>
                )}
              </div>

              <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 font-mono text-[10px] text-stone-200 border border-white/10 backdrop-blur-xs">
                <Clock className="h-3 w-3 text-amber-300" />
                {item.prepTimeMinutes} min
              </span>
            </div>

            {/* Dish Name */}
            <h3 className="font-serif text-base font-bold sm:text-lg leading-snug text-white tracking-tight drop-shadow-xs transition-colors group-hover:text-amber-200">
              <HighlightedText text={item.name} query={searchQuery} />
            </h3>

            {/* Dish Description */}
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-stone-300/90 drop-shadow-xs font-sans">
              {item.description ? (
                <HighlightedText text={item.description} query={searchQuery} />
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>

            {/* Price and Action Row */}
            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-white/15">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase font-mono tracking-wider text-stone-300">
                  Price
                </span>
                <span className="font-sans text-base sm:text-lg font-bold text-amber-300">
                  {formatPaiseToINR(item.pricePaise)}
                </span>
              </div>

              {/* Floating Action Button / Stepper */}
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                {totalQuantityInCart > 0 ? (
                  <div className="flex min-h-[44px] items-center rounded-full bg-[var(--primary)] text-white shadow-lg border border-amber-300/40 backdrop-blur-xs p-0.5">
                    <button
                      type="button"
                      aria-label={`Decrease ${item.name} quantity`}
                      onClick={handleDecrement}
                      className="flex h-10 w-9 min-h-[44px] min-w-[36px] items-center justify-center rounded-full hover:bg-black/20 active:scale-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span
                      data-testid="item-card-quantity"
                      className="min-w-6 text-center font-mono text-xs font-bold px-1"
                    >
                      {totalQuantityInCart}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase ${item.name} quantity`}
                      onClick={handleIncrement}
                      className="flex h-10 w-9 min-h-[44px] min-w-[36px] items-center justify-center rounded-full hover:bg-black/20 active:scale-90 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="add-item-btn"
                    disabled={!isAvailable}
                    onClick={handleQuickAdd}
                    aria-label={
                      isAvailable ? `Add ${item.name} to order` : `${item.name} is sold out`
                    }
                    className={cn(
                      "flex h-11 w-11 min-h-[44px] min-w-[44px] rounded-full items-center justify-center shadow-lg transition-all cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]",
                      isAvailable
                        ? "bg-gradient-to-br from-[var(--primary)] to-[var(--primary-hover)] text-white hover:brightness-110 border border-amber-300/40"
                        : "bg-white/20 text-white/40 cursor-not-allowed opacity-50"
                    )}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </button>
    </article>
  );
}
