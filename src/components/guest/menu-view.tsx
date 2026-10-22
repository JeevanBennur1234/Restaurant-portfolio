"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { MenuItemCard } from "./menu-item-card";
import { PairingCard } from "./pairing-card";
import { ItemDetailSheet } from "./item-detail-sheet";
import { CartBar } from "./cart-bar";
import { CartSheet } from "./cart-sheet";
import { VegIndicator } from "./veg-indicator";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  UtensilsCrossed,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GuestCategory, GuestMenuItem, GuestTable } from "@/lib/api/types";

export interface MenuViewProps {
  categories: GuestCategory[];
  items: GuestMenuItem[];
  table: GuestTable;
  restaurantName?: string;
  paymentsEnabled?: boolean;
  paymentsTestMode?: boolean;
}

type DietaryFilter = "all" | "veg" | "non-veg";
type SpiceFilter = "all" | "mild" | "medium" | "fiery";

const SHOPFRONT_TAGLINES: Record<string, string> = {
  "small-plates-chaats": "Crisp street savouries, tangy chutneys & nostalgic bazaar crunch",
  "tandoor-sigdi-grills": "Charcoal-kissed skewers, fiery marinades & slow-smoked cuts",
  "signature-curries": "Velvety gravies, 24-hour slow simmers & heirloom copper-pot heritage",
  "dum-biryanis-pulao": "Fragrant aged basmati, saffron dum steam & royal sealed handis",
  "artisanal-breads-sides": "Fresh from the clay tandoor, flaky layers & cooling whipped raitas",
  "desserts-beverages": "Rich saffron reductions, chilled kulfis & sweet artisanal sips",
};

export function MenuView({
  categories,
  items,
  table,
  restaurantName = "Masala Lane",
  paymentsEnabled = true,
  paymentsTestMode = false,
}: MenuViewProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dietaryFilter, setDietaryFilter] = React.useState<DietaryFilter>("all");
  const [spiceFilter, setSpiceFilter] = React.useState<SpiceFilter>("all");
  const [activeCategoryId, setActiveCategoryId] = React.useState<string>(
    categories[0]?.id ?? ""
  );
  const [selectedItemForSheet, setSelectedItemForSheet] =
    React.useState<GuestMenuItem | null>(null);

  const shouldReduceMotion = useReducedMotion();
  const isManualScrollRef = React.useRef(false);
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const navRef = React.useRef<HTMLDivElement | null>(null);
  const [canScrollCategoryLeft, setCanScrollCategoryLeft] = React.useState(false);
  const [canScrollCategoryRight, setCanScrollCategoryRight] = React.useState(false);

  const updateCategoryScrollAffordance = React.useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    setCanScrollCategoryLeft(nav.scrollLeft > 2);
    setCanScrollCategoryRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2);
  }, []);

  const scrollCategoriesBy = React.useCallback(
    (direction: -1 | 1) => {
      const nav = navRef.current;
      if (!nav) return;
      nav.scrollBy({
        left: direction * Math.max(180, nav.clientWidth * 0.65),
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    },
    [shouldReduceMotion]
  );

  // Filter items based on search, dietary filter, and spice filter
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      // 1. Dietary filter
      if (dietaryFilter === "veg" && !item.isVeg) return false;
      if (dietaryFilter === "non-veg" && item.isVeg) return false;

      // 2. Spice filter
      if (spiceFilter !== "all") {
        const text = `${item.name} ${item.description ?? ""} ${item.modifiers.map((m) => m.name).join(" ")}`.toLowerCase();
        const isFiery = /extra fiery|guntur|teja|fiery|naga|vindaloo|extra hot/i.test(text);
        const isMedium = /regular|medium|spicy|masala|kadai|peppercorn|mirch|tandoori|chilli|sigdi/i.test(text);
        const isMild = /mild|delicate|creamy|buttery|malai|korma|cashew|jeera|dal|kheer|kulfi|sweet/i.test(text);

        if (spiceFilter === "fiery" && !isFiery) return false;
        if (spiceFilter === "medium" && (!isMedium || isFiery)) return false;
        if (spiceFilter === "mild" && (!isMild || isFiery || isMedium)) return false;
      }

      // 3. Search query filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query) ?? false;
        const matchesIngredients =
          Boolean((item as unknown as { ingredients?: string | string[] }).ingredients) &&
          (Array.isArray((item as unknown as { ingredients?: string[] }).ingredients)
            ? (item as unknown as { ingredients: string[] }).ingredients.some((ing) =>
                ing.toLowerCase().includes(query)
              )
            : String((item as unknown as { ingredients?: string }).ingredients)
                .toLowerCase()
                .includes(query));
        const matchesModifiers = item.modifiers.some(
          (mod) =>
            mod.name.toLowerCase().includes(query) ||
            mod.groupName.toLowerCase().includes(query)
        );
        return matchesName || matchesDesc || matchesIngredients || matchesModifiers;
      }

      return true;
    });
  }, [items, dietaryFilter, spiceFilter, searchQuery]);

  // Group filtered items by category
  const itemsByCategory = React.useMemo(() => {
    const map = new Map<string, GuestMenuItem[]>();
    for (const cat of categories) {
      map.set(cat.id, []);
    }
    for (const item of filteredItems) {
      const list = map.get(item.categoryId);
      if (list) {
        list.push(item);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    }
    return map;
  }, [categories, filteredItems]);

  // Chef's picks recommended items (hide if none)
  const recommendedItems = React.useMemo(() => {
    return items
      .filter((item) => Boolean((item as { isRecommended?: boolean }).isRecommended || item.isBestSeller))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [items]);

  // Pairing ingredients are looked up from real menu records, so prices, availability, and images stay authoritative.
  const pairingItems = React.useMemo(() => {
    const garlicNaan = items.find((item) => /^(garlic butter|garlic) naan$/i.test(item.name.trim()));
    const buraniRaita = items.find((item) => /burani.*raita/i.test(item.name));
    if (!garlicNaan || !buraniRaita || !garlicNaan.isAvailable || !buraniRaita.isAvailable) return null;
    return { bread: garlicNaan, side: buraniRaita };
  }, [items]);
  const showPairing =
    searchQuery.trim().length === 0 && dietaryFilter === "all" && spiceFilter === "all";

  // The category's own slug is the source of truth for the Signature label.
  const signatureCategoryIds = React.useMemo(
    () =>
      new Set(
        categories
          .filter((category) => category.slug === "signature-curries")
          .map((category) => category.id)
      ),
    [categories]
  );

  const handleCategoryClick = (categoryId: string) => {
    isManualScrollRef.current = true;
    setActiveCategoryId(categoryId);

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isManualScrollRef.current = false;
    }, 750);

    const element = document.getElementById(`category-section-${categoryId}`);
    if (element) {
      element.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "start",
      });
    }
  };

  // Scroll-spy with IntersectionObserver
  React.useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (isManualScrollRef.current) return;

        const visibleEntries = entries.filter((e) => e.isIntersecting);
        if (visibleEntries.length > 0) {
          visibleEntries.sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - 120) -
              Math.abs(b.boundingClientRect.top - 120)
          );
          const topTarget = visibleEntries[0].target;
          const matchedId = topTarget.id.replace("category-section-", "");
          if (matchedId) {
            setActiveCategoryId(matchedId);
          }
        }
      },
      {
        rootMargin: "-120px 0px -50% 0px",
        threshold: [0, 0.1, 0.5],
      }
    );

    for (const cat of categories) {
      const el = document.getElementById(`category-section-${cat.id}`);
      if (el) observer.observe(el);
    }

    return () => {
      observer.disconnect();
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [categories]);

  // Keep the active tab visible without allowing it to scroll the entire page.
  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const activeBtn = nav.querySelector<HTMLElement>(
      `[data-category-id="${activeCategoryId}"]`
    );
    if (activeBtn) {
      const navRect = nav.getBoundingClientRect();
      const buttonRect = activeBtn.getBoundingClientRect();
      const delta =
        buttonRect.left - navRect.left + buttonRect.width / 2 - nav.clientWidth / 2;
      nav.scrollTo({
        left: Math.max(0, nav.scrollLeft + delta),
        behavior: shouldReduceMotion ? "auto" : "smooth",
      });
    }
  }, [activeCategoryId, shouldReduceMotion]);

  React.useEffect(() => {
    updateCategoryScrollAffordance();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateCategoryScrollAffordance);
    observer.observe(nav);
    if (nav.firstElementChild) observer.observe(nav.firstElementChild);
    return () => observer.disconnect();
  }, [categories, updateCategoryScrollAffordance]);

  return (
    <div className="flex-1 flex flex-col pb-28 overflow-x-hidden">
      {/* Compact Editorial Hero Banner (<200px tall so menu starts on screen one) */}
      <section
        aria-label={`Menu for ${restaurantName}`}
        data-restaurant={restaurantName}
        className="relative overflow-hidden bg-gradient-to-br from-[#2E2723] via-[#3A312B] to-[#1F1A17] py-2 sm:py-4 text-[#FAF7F2] border-b border-[var(--border-subtle)]"
      >
        {/* Ambient warm tandoor glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[var(--primary)]/20 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-[var(--accent)]/15 blur-2xl"
        />

        <div className="relative mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="eyebrow text-xs sm:text-sm text-amber-300/90 font-medium tracking-[0.16em] sm:tracking-[0.2em]">
              00 · Table Dining
            </span>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-[#FAF7F2] font-mono text-sm font-semibold border border-white/15 backdrop-blur-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{table.tableNumber}</span>
            </div>
          </div>

          <p className="font-serif text-base sm:text-xl font-semibold tracking-tight text-[#FAF7F2] leading-tight">
            Order fresh from our kitchen
          </p>
        </div>
      </section>

      {/* Search Bar & Dietary/Spice Filter Section */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <div className="mx-auto w-full max-w-7xl space-y-1.5 px-3 py-1.5 sm:space-y-3 sm:px-6 sm:py-3 lg:px-8">
          {/* Search Input */}
          <div className="relative flex w-full max-w-2xl items-center">
            <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[var(--text-muted)]" />
            <input
              type="search"
              data-testid="menu-search-input"
              aria-label="Search menu dishes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes, ingredients, curries..."
              autoComplete="off"
              className="h-11 sm:h-12 w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/65 pl-11 pr-11 text-base text-[var(--text-primary)] shadow-inner shadow-black/[0.02] transition-[border-color,background-color,box-shadow] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
            />
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Refined, accessible dietary and spice filter chips */}
          <div className="flex w-full max-w-2xl flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar pt-0.5 sm:flex-wrap sm:overflow-visible">
            <button
              type="button"
              aria-pressed={dietaryFilter === "all"}
              onClick={() => setDietaryFilter("all")}
              className={cn(
                "inline-flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-full border px-3 sm:px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2 cursor-pointer",
                dietaryFilter === "all"
                  ? "border-[var(--secondary)] bg-[var(--secondary)] text-white shadow-[0_3px_10px_rgba(46,39,35,0.18)]"
                  : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
              )}
            >
              <span>All items</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-xs",
                  dietaryFilter === "all"
                    ? "bg-white/15 text-white/85"
                    : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                )}
              >
                {items.length}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={dietaryFilter === "veg"}
              onClick={() => setDietaryFilter("veg")}
              className={cn(
                "inline-flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-full border px-3 sm:px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 focus-visible:ring-offset-2 cursor-pointer",
                dietaryFilter === "veg"
                  ? "border-emerald-800 bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-700/25"
                  : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-emerald-700/40 hover:bg-emerald-50/60"
              )}
            >
              <VegIndicator isVeg={true} size="sm" />
              <span>Veg only</span>
            </button>

            <button
              type="button"
              aria-pressed={dietaryFilter === "non-veg"}
              onClick={() => setDietaryFilter("non-veg")}
              className={cn(
                "inline-flex min-h-[44px] shrink-0 whitespace-nowrap items-center gap-2 rounded-full border px-3 sm:px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/30 focus-visible:ring-offset-2 cursor-pointer",
                dietaryFilter === "non-veg"
                  ? "border-rose-900 bg-rose-50 text-rose-950 shadow-sm ring-1 ring-rose-800/20"
                  : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-rose-800/35 hover:bg-rose-50/50"
              )}
            >
              <VegIndicator isVeg={false} size="sm" />
              <span>Non-veg</span>
            </button>

            {/* Spice Flame Filter Toggle */}
            <div className="hidden sm:flex items-center gap-1 pl-2 border-l border-[var(--border-subtle)]">
              {(["all", "mild", "medium", "fiery"] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSpiceFilter(level)}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    spiceFilter === level
                      ? "bg-amber-100 text-amber-900 font-bold border border-amber-300"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                  )}
                >
                  {level !== "all" && (
                    <Flame
                      className={cn(
                        "h-3 w-3",
                        level === "fiery"
                          ? "text-rose-600 fill-rose-600"
                          : level === "medium"
                            ? "text-amber-500 fill-amber-500"
                            : "text-amber-400"
                      )}
                    />
                  )}
                  <span className="capitalize">{level === "all" ? "All spice" : level}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Immediate search/filter feedback and one-tap reset */}
          <div className="flex min-h-4 w-full max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--border-subtle)]/60 pt-1.5 sm:pt-2.5">
            <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--text-muted)]">
              {searchQuery.trim() ? (
                <>
                  Found{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    {filteredItems.length}
                  </span>{" "}
                  {filteredItems.length === 1 ? "dish" : "dishes"} for{" "}
                  <span className="font-semibold text-[var(--text-primary)]">
                    &quot;{searchQuery.trim()}&quot;
                  </span>
                </>
              ) : dietaryFilter === "veg" ? (
                <>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {filteredItems.length}
                  </span>{" "}
                  vegetarian {filteredItems.length === 1 ? "dish" : "dishes"}
                </>
              ) : dietaryFilter === "non-veg" ? (
                <>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {filteredItems.length}
                  </span>{" "}
                  non-vegetarian {filteredItems.length === 1 ? "dish" : "dishes"}
                </>
              ) : (
                <>
                  <span className="font-semibold text-[var(--text-primary)]">
                    {filteredItems.length}
                  </span>{" "}
                  dishes on the menu
                </>
              )}
            </p>
            {(searchQuery.trim().length > 0 || dietaryFilter !== "all" || spiceFilter !== "all") && (
              <button
                type="button"
                data-testid="clear-menu-filters"
                onClick={() => {
                  setSearchQuery("");
                  setDietaryFilter("all");
                  setSpiceFilter("all");
                }}
                className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sticky "Lane Rail" Category Signboards Navigation */}
      <div className="sticky top-[49px] sm:top-[61px] z-20 border-y border-[#2E2723] bg-[#14100E]/95 shadow-xs backdrop-blur-md">
        <nav
          ref={navRef}
          aria-label="Menu categories"
          onScroll={updateCategoryScrollAffordance}
          className="flex w-full min-w-0 gap-3 overflow-x-auto px-10 py-2.5 sm:px-11 sm:py-3 no-scrollbar scroll-smooth"
        >
          <div className="flex w-max min-w-max gap-3">
            {categories.map((cat) => {
              const count = itemsByCategory.get(cat.id)?.length ?? 0;
              const isActive = activeCategoryId === cat.id;

              return (
                <button
                  key={cat.id}
                  data-category-id={cat.id}
                  type="button"
                  onClick={() => handleCategoryClick(cat.id)}
                  aria-current={isActive ? "location" : undefined}
                  className={cn(
                    "relative flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-left transition-all duration-200 cursor-pointer select-none whitespace-nowrap",
                    isActive
                      ? "z-10 border-[#D4A373] bg-[#2E231D] font-semibold text-[#FAF7F2] shadow-md shadow-black/40"
                      : "border-[#2E2723] bg-[#1A1614] text-stone-400 hover:border-stone-600 hover:text-stone-200"
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeCategoryPill"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 450, damping: 32 }
                      }
                      className="absolute inset-0 -z-10 rounded-xl bg-[#2E231D] shadow-xs"
                    />
                  )}
                  <span className="font-serif text-sm font-semibold tracking-wide">{cat.name}</span>
                  {count > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 font-mono text-[10px] transition-colors",
                        isActive
                          ? "bg-white/15 text-white"
                          : "bg-[#241E1A] text-stone-500"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
        {canScrollCategoryLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-7 z-10 w-4 bg-gradient-to-r from-[#14100E] via-[#14100E]/85 to-transparent"
          />
        )}
        {canScrollCategoryRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-7 z-10 w-4 bg-gradient-to-l from-[#14100E] via-[#14100E]/85 to-transparent"
          />
        )}
        {canScrollCategoryLeft && (
          <button
            type="button"
            aria-label="Scroll categories left"
            onClick={() => scrollCategoriesBy(-1)}
            className="absolute left-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#3A302A] bg-[#1A1614]/95 text-[#FAF7F2] shadow-sm transition hover:bg-[#2E231D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {canScrollCategoryRight && (
          <button
            type="button"
            aria-label="Scroll categories right"
            onClick={() => scrollCategoriesBy(1)}
            className="absolute right-1 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#3A302A] bg-[#1A1614]/95 text-[#FAF7F2] shadow-sm transition hover:bg-[#2E231D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 cursor-pointer"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Main Street Content */}
      <main className="mx-auto w-full max-w-7xl space-y-8 px-3 py-4 sm:space-y-10 sm:px-6 sm:py-6 lg:px-8">
        {/* Chef's Picks uses the same full-width signboard header and responsive card layout as every menu category. */}
        {(recommendedItems.length > 0 || (pairingItems && showPairing)) && searchQuery.trim().length === 0 && (
          <section aria-label="Chef's picks" className="space-y-3 sm:space-y-4 pt-1">
            <div className="flex flex-col gap-1 border-b-2 border-[#2E2723]/10 pb-2.5 sm:pb-3.5 pt-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="font-mono text-[11px] sm:text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-xs bg-[#2E2723] text-amber-300 border border-amber-500/30 shadow-xs">
                    CHEF&apos;S PICKS
                  </span>
                  <h2 className="font-serif text-lg sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                    Chef&apos;s Street Picks
                  </h2>
                </div>
                <span className="shrink-0 font-mono text-sm font-medium text-[var(--text-muted)] bg-[var(--bg-subtle)] px-3 py-1 rounded-full border border-[var(--border-subtle)]">
                  {recommendedItems.length > 0 ? `${recommendedItems.length} recommended` : "Pairing idea"}
                </span>
              </div>
              <p className="pl-0.5 text-sm font-sans italic text-[var(--text-secondary)] max-w-2xl">
                Hand-crafted street favorites and daily recommendations
              </p>
            </div>

            {/* Mobile: match the category scroll-snap card row. */}
            <div className="flex w-full gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-3 pt-1 px-0.5 sm:hidden">
              {recommendedItems.map((item, idx) => (
                <div key={item.id} className="w-[260px] xs:w-[280px] shrink-0 snap-start">
                  <MenuItemCard
                    item={item}
                    priority={idx < 2}
                    searchQuery={searchQuery}
                    isSignature={signatureCategoryIds.has(item.categoryId)}
                    onSelect={(selected) => setSelectedItemForSheet(selected)}
                  />
                </div>
              ))}
              {pairingItems && showPairing && (
                <div className="w-[260px] xs:w-[280px] shrink-0 snap-start">
                  <PairingCard bread={pairingItems.bread} side={pairingItems.side} />
                </div>
              )}
            </div>

            {/* Desktop: strict row-major order prevents artificial holes in short final rows. */}
            <div className="hidden sm:grid sm:grid-flow-row sm:grid-cols-2 sm:items-stretch sm:gap-4 lg:grid-cols-3 lg:gap-5">
              {recommendedItems.map((item, itemIndex) => (
                <div key={item.id} className="h-full min-w-0">
                  <MenuItemCard
                    item={item}
                    priority={itemIndex < 2}
                    searchQuery={searchQuery}
                    isSignature={signatureCategoryIds.has(item.categoryId)}
                    onSelect={(selected) => setSelectedItemForSheet(selected)}
                  />
                </div>
              ))}
              {pairingItems && showPairing && (
                <div
                  className={cn(
                    "h-full min-w-0",
                    recommendedItems.length % 2 === 0 && "sm:col-start-2",
                    recommendedItems.length % 3 === 0 && "lg:col-start-2",
                    recommendedItems.length % 2 === 0 && recommendedItems.length % 3 !== 0 && "lg:col-start-auto"
                  )}
                >
                  <PairingCard bread={pairingItems.bread} side={pairingItems.side} />
                </div>
              )}
            </div>
          </section>
        )}
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-muted)]">
            <UtensilsCrossed className="h-10 w-10 opacity-30 text-[var(--primary)] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
              No dishes found
            </h3>
            <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
              {searchQuery.trim()
                ? `No dishes match "${searchQuery.trim()}". Try another term or clear the filters.`
                : "No dishes currently match the selected dietary or spice filters."}
            </p>
            {(searchQuery.trim() || dietaryFilter !== "all" || spiceFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDietaryFilter("all");
                  setSpiceFilter("all");
                }}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-white px-4 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)] cursor-pointer"
              >
                <X className="h-3.5 w-3.5" /> Reset search and filters
              </button>
            )}
          </div>
        ) : (
          categories.map((category, catIndex) => {
            const catItems = itemsByCategory.get(category.id) ?? [];
            if (catItems.length === 0) return null;

            return (
              <section
                key={category.id}
                id={`category-section-${category.id}`}
                className="scroll-mt-28 space-y-3 sm:space-y-4"
              >
                {/* Shopfront Signboard-Style Header */}
                <div className="flex flex-col gap-1 border-b-2 border-[#2E2723]/10 pb-2.5 sm:pb-3.5 pt-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-serif text-lg sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                      {category.name}
                    </h2>
                    <span className="shrink-0 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)] px-3 py-1 font-mono text-sm font-medium text-[var(--text-muted)]">
                      {catItems.length} {catItems.length === 1 ? "specialty" : "specialties"}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] font-sans italic max-w-2xl pl-0.5">
                    {SHOPFRONT_TAGLINES[category.slug] ??
                      "Artisanal specialties crafted fresh daily with traditional Indian spices."}
                  </p>
                </div>

                {/* Mobile: Horizontal scroll-snap row of tall poster cards (about 4:5) */}
                <div className="flex w-full gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-3 pt-1 px-0.5 sm:hidden">
                  {catItems.map((item, itemIdx) => (
                    <div key={item.id} className="w-[260px] xs:w-[280px] shrink-0 snap-start">
                      <MenuItemCard
                        item={item}
                        priority={catIndex === 0 && itemIdx < 2}
                        searchQuery={searchQuery}
                        isSignature={signatureCategoryIds.has(item.categoryId)}
                        onSelect={(selected) => setSelectedItemForSheet(selected)}
                      />
                    </div>
                  ))}
                </div>

                {/* Desktop: strict row-major order keeps every category gap-free and left-to-right. */}
                <div className="hidden sm:grid sm:grid-flow-row sm:grid-cols-2 sm:items-stretch sm:gap-4 lg:grid-cols-3 lg:gap-5">
                  {catItems.map((item, itemIndex) => (
                    <div key={item.id} className="h-full min-w-0">
                      <MenuItemCard
                        item={item}
                        priority={catIndex === 0 && itemIndex < 2}
                        searchQuery={searchQuery}
                        isSignature={signatureCategoryIds.has(item.categoryId)}
                        onSelect={(selected) => setSelectedItemForSheet(selected)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Item Detail & Modifiers Sheet */}
      <ItemDetailSheet
        item={selectedItemForSheet}
        isOpen={selectedItemForSheet !== null}
        onClose={() => setSelectedItemForSheet(null)}
      />

      {/* Cart Bottom Sheet */}
      <CartSheet
        tableLabel={table.tableNumber}
        token={table.qrToken}
        paymentsEnabled={paymentsEnabled}
        paymentsTestMode={paymentsTestMode}
      />

      {/* Sticky Bottom "View Cart" Floating Bar */}
      <CartBar />
    </div>
  );
}
