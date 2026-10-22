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
  priority = false,
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
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[#3A302A] bg-[#1A1614] text-[#FAF7F2] shadow-lg transition-all duration-300 hover:border-[#D4A373]/50 hover:shadow-2xl",
        isHero && "border-[#D4A373]/60 ring-1 ring-[#D4A373]/20",
        isAvailable ? "active:scale-[0.99]" : "cursor-not-allowed opacity-65"
      )}
    >
      <div
        role="group"
        tabIndex={isAvailable ? 0 : -1}
        data-testid="menu-item-details-btn"
        aria-label={`Open details for ${item.name}`}
        onClick={() => {
          if (isAvailable) onSelect(item);
        }}
        onKeyDown={(event) => {
          if (
            isAvailable &&
            event.target === event.currentTarget &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onSelect(item);
          }
        }}
        className={cn(
          "relative flex w-full min-w-0 flex-1 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-inset",
          isAvailable ? "cursor-pointer" : "cursor-not-allowed"
        )}
      >
        {/* Editorial food photography: wide landscape crop above a separate charcoal card body. */}
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#241E1A]">
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
                priority={priority || item.sortOrder <= 3}
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
            <div
              data-testid="dish-image-fallback"
              className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-[#2E2723] via-[#3D332D] to-[#1F1A18] p-5 text-center text-white/80"
            >
              <Utensils className="mb-2 h-10 w-10 text-amber-500 opacity-40" />
              <span className="max-w-full text-balance text-center font-serif text-sm font-medium tracking-wide text-amber-200">
                {item.name}
              </span>
              <span className="mt-1 text-[11px] text-stone-400">Photo coming soon</span>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#1A1614]/85 via-transparent to-black/25" />

          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-black/65 p-0.5 backdrop-blur-sm">
              <VegIndicator isVeg={item.isVeg} size="sm" />
            </span>
            {isSignature && (
              <Badge
                variant="accent"
                size="sm"
                className="gap-1 border border-amber-400/30 bg-[#2E2723]/90 font-serif text-amber-100 shadow-sm backdrop-blur-xs"
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
                Shopfront pick
              </Badge>
            )}
          </div>
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
            {isCustomizable && isAvailable && (
              <span className="rounded-full border border-white/20 bg-black/70 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-300 backdrop-blur-sm">
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
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-2xs">
              <span className="rounded-full border border-white/25 bg-black/80 px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-white">
                Currently Unavailable
              </span>
            </div>
          )}
        </div>

        {/* Separate body keeps dish names, descriptions, prices, and quantity controls easy to scan. */}
        <div className="flex flex-1 flex-col justify-between p-4 sm:p-5">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 text-xs text-stone-400">
              <div data-testid="spice-level-slot" className="flex min-w-0 items-center gap-1.5">
                {spiceInfo.flames > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2 py-1" title={`Spice level: ${spiceInfo.label}`}>
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <Flame
                          key={index}
                          className={cn(
                            "h-3 w-3",
                            index < spiceInfo.flames ? "fill-rose-500 text-rose-400" : "fill-white/10 text-white/25"
                          )}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-rose-200">
                      {spiceInfo.label}
                    </span>
                  </span>
                ) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-stone-400">Delicate</span>
                )}
              </div>
              {item.prepTimeMinutes > 0 && (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/25 px-2.5 py-1 font-mono text-[11px] text-stone-200">
                  <Clock className="h-3.5 w-3.5 text-amber-400/80" aria-hidden="true" />
                  {item.prepTimeMinutes} min
                </span>
              )}
            </div>

            <h3 className="font-serif text-xl font-bold leading-tight tracking-tight text-[#FAF7F2] transition-colors group-hover:text-amber-200 sm:text-2xl">
              <HighlightedText text={item.name} query={searchQuery} />
            </h3>
            <p className="mt-1.5 line-clamp-3 font-sans text-sm leading-relaxed text-stone-300/85 sm:text-base">
              {item.description ? (
                <HighlightedText text={item.description} query={searchQuery} />
              ) : (
                <span aria-hidden="true">&nbsp;</span>
              )}
            </p>
          </div>

          <div className="mt-4 flex items-end justify-between gap-3 border-t border-[#2F2722] pt-3">
            <div className="min-w-0">
              <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
                Price
              </span>
              <span className="font-serif text-2xl font-bold text-amber-300 sm:text-[1.75rem]">
                {formatPaiseToINR(item.pricePaise)}
              </span>
            </div>

            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {totalQuantityInCart > 0 ? (
                <div className="flex min-h-[44px] items-center rounded-full border border-amber-300/40 bg-gradient-to-br from-[#D4A373] to-[#B37840] p-0.5 text-[#1A1614] shadow-md">
                  <button
                    type="button"
                    aria-label={`Decrease ${item.name} quantity`}
                    onClick={handleDecrement}
                    className="flex h-10 min-h-[44px] min-w-[36px] items-center justify-center rounded-full transition-all hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1614] active:scale-90"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span data-testid="item-card-quantity" className="min-w-6 px-1 text-center font-mono text-sm font-bold">
                    {totalQuantityInCart}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase ${item.name} quantity`}
                    onClick={handleIncrement}
                    className="flex h-10 min-h-[44px] min-w-[36px] items-center justify-center rounded-full transition-all hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A1614] active:scale-90"
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
                  aria-label={isAvailable ? `Add ${item.name} to order` : `${item.name} is sold out`}
                  className={cn(
                    "flex min-h-[44px] min-w-[44px] rounded-full h-11 w-11 cursor-pointer items-center justify-center border border-amber-300/40 shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] active:scale-95",
                    isAvailable
                      ? "bg-gradient-to-br from-[#D4A373] to-[#B37840] text-[#1A1614] hover:brightness-110"
                      : "cursor-not-allowed bg-white/20 text-white/40 opacity-50"
                  )}
                >
                  <Plus className="h-5 w-5 stroke-[2.5]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
