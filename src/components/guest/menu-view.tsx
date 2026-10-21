"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { MenuItemCard } from "./menu-item-card";
import { ItemDetailSheet } from "./item-detail-sheet";
import { CartBar } from "./cart-bar";
import { CartSheet } from "./cart-sheet";
import { VegIndicator } from "./veg-indicator";
import { Search, X, UtensilsCrossed, Sparkles } from "lucide-react";
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

  // Filter items based on search and dietary filter
  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      // 1. Dietary filter
      if (dietaryFilter === "veg" && !item.isVeg) return false;
      if (dietaryFilter === "non-veg" && item.isVeg) return false;

      // 2. Search query filter
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query) ?? false;
        return matchesName || matchesDesc;
      }

      return true;
    });
  }, [items, dietaryFilter, searchQuery]);

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
    return map;
  }, [categories, filteredItems]);

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
          // Find the section whose top is closest to sticky category bar (~110px offset)
          visibleEntries.sort(
            (a, b) =>
              Math.abs(a.boundingClientRect.top - 110) -
              Math.abs(b.boundingClientRect.top - 110)
          );
          const topTarget = visibleEntries[0].target;
          const matchedId = topTarget.id.replace("category-section-", "");
          if (matchedId) {
            setActiveCategoryId(matchedId);
          }
        }
      },
      {
        rootMargin: "-110px 0px -55% 0px",
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
      const delta = buttonRect.left - navRect.left + buttonRect.width / 2 - nav.clientWidth / 2;
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
    <div className="flex-1 flex flex-col pb-28">
      {/* Compact Editorial Hero Banner (<200px tall so menu starts on screen one) */}
      <section
        aria-label="Restaurant banner"
        className="relative overflow-hidden bg-gradient-to-br from-[#2E2723] via-[#3A312B] to-[#1F1A17] px-4 py-4 sm:py-5 text-[#FAF7F2] border-b border-[var(--border-subtle)]"
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

        <div className="relative max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="eyebrow text-[10px] sm:text-[11px] text-amber-300/90 font-medium tracking-[0.2em]">
              00 · Table Dining
            </span>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 text-[#FAF7F2] font-mono text-xs font-semibold border border-white/15 backdrop-blur-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{table.tableNumber}</span>
            </div>
          </div>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#FAF7F2] leading-tight flex items-center gap-2">
            <span>{restaurantName}</span>
            <Sparkles className="h-4 w-4 text-[#D97706] opacity-75 shrink-0" />
          </h1>

          <p className="mt-1 text-xs text-stone-300 leading-relaxed max-w-md line-clamp-1">
            Clay-pot curries, slow tandoor grills & coastal specials prepared fresh.
          </p>
        </div>
      </section>

      {/* Search Bar & Veg/Non-Veg Filter Section */}
      <div className="bg-[var(--bg-surface)] px-4 py-3 border-b border-[var(--border-subtle)] space-y-3">
        {/* Search Input */}
        <div className="relative mx-auto flex w-full max-w-2xl items-center">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="search"
            data-testid="menu-search-input"
            aria-label="Search menu dishes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search dishes, ingredients, curries..."
            autoComplete="off"
            className="h-11 w-full rounded-full border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/65 pl-11 pr-11 text-sm text-[var(--text-primary)] shadow-inner shadow-black/[0.02] transition-[border-color,background-color,box-shadow] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)]"
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

        {/* Refined, accessible dietary filter chips */}
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            aria-pressed={dietaryFilter === "all"}
            onClick={() => setDietaryFilter("all")}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)] focus-visible:ring-offset-2",
              dietaryFilter === "all"
                ? "border-[var(--secondary)] bg-[var(--secondary)] text-white shadow-[0_3px_10px_rgba(46,39,35,0.18)]"
                : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
            )}
          >
            <span>All items</span>
            <span className={cn("rounded-full px-1.5 py-0.5 font-mono text-[10px]", dietaryFilter === "all" ? "bg-white/15 text-white/85" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]")}>
              {items.length}
            </span>
          </button>

          <button
            type="button"
            aria-pressed={dietaryFilter === "veg"}
            onClick={() => setDietaryFilter("veg")}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700/30 focus-visible:ring-offset-2",
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
              "inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/30 focus-visible:ring-offset-2",
              dietaryFilter === "non-veg"
                ? "border-rose-900 bg-rose-50 text-rose-950 shadow-sm ring-1 ring-rose-800/20"
                : "border-[var(--border-subtle)] bg-white text-[var(--text-secondary)] hover:border-rose-800/35 hover:bg-rose-50/50"
            )}
          >
            <VegIndicator isVeg={false} size="sm" />
            <span>Non-veg</span>
          </button>
        </div>

        {/* Immediate search/filter feedback and one-tap reset */}
        <div className="mx-auto flex min-h-6 w-full max-w-2xl flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--border-subtle)]/80 pt-2.5">
          <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--text-muted)]">
            {searchQuery.trim() ? (
              <>
                Found <span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span>{" "}
                {filteredItems.length === 1 ? "dish" : "dishes"} for{" "}
                <span className="font-semibold text-[var(--text-primary)]">?{searchQuery.trim()}?</span>
              </>
            ) : dietaryFilter === "veg" ? (
              <><span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span> vegetarian {filteredItems.length === 1 ? "dish" : "dishes"}</>
            ) : dietaryFilter === "non-veg" ? (
              <><span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span> non-vegetarian {filteredItems.length === 1 ? "dish" : "dishes"}</>
            ) : (
              <><span className="font-semibold text-[var(--text-primary)]">{filteredItems.length}</span> dishes on the menu</>
            )}
          </p>
          {(searchQuery.trim().length > 0 || dietaryFilter !== "all") && (
            <button
              type="button"
              data-testid="clear-menu-filters"
              onClick={() => {
                setSearchQuery("");
                setDietaryFilter("all");
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-focus)]"
            >
              <X className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Sticky, horizontally scrollable category navigation */}
      <div className="sticky top-[60px] z-20 border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/95 shadow-2xs backdrop-blur-md">
        <nav
          ref={navRef}
          aria-label="Menu categories"
          onScroll={updateCategoryScrollAffordance}
          className="flex w-full min-w-0 gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar scroll-smooth"
        >
          <div className="mx-auto flex w-max min-w-full gap-2">
            {categories.map((cat, idx) => {
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
                    "relative flex min-h-[44px] shrink-0 items-center rounded-full px-4 py-2 text-xs font-medium tracking-wide transition-colors cursor-pointer select-none",
                    isActive
                      ? "z-10 font-semibold text-white"
                      : "border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)]"
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
                      className="absolute inset-0 -z-10 rounded-full bg-[var(--primary)] shadow-xs"
                    />
                  )}
                  <span className={cn("mr-1.5 font-mono text-[10px] transition-colors", isActive ? "text-white/80" : "opacity-75")}>
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span>{cat.name}</span>
                  {count > 0 && (
                    <span className={cn("ml-1.5 font-mono text-[10px] transition-colors", isActive ? "text-white/85" : "opacity-60")}>
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
        {canScrollCategoryLeft && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-[var(--bg-app)] to-transparent" />
        )}
        {canScrollCategoryRight && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-[var(--bg-app)] to-transparent" />
        )}
      </div>

      {/* Menu Sections & Image-Led Item Cards */}
      <main className="mx-auto w-full max-w-7xl space-y-7 px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-muted)]">
            <UtensilsCrossed className="h-10 w-10 opacity-30 text-[var(--primary)] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
              No dishes found
            </h3>
            <p className="mt-1 max-w-xs text-xs text-[var(--text-secondary)]">
              {searchQuery.trim()
                ? `No dishes match ?${searchQuery.trim()}?${dietaryFilter !== "all" ? " with this dietary filter" : ""}. Try another term or clear the filters.`
                : "No dishes currently match the selected dietary filter."}
            </p>
            {(searchQuery.trim() || dietaryFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setDietaryFilter("all");
                }}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-white px-4 text-xs font-semibold text-[var(--text-primary)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-subtle)]"
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
                className="scroll-mt-32 space-y-3"
              >
                <div className="flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-mono font-bold text-[var(--accent)]">
                      {String(catIndex + 1).padStart(2, "0")} /
                    </span>
                    <h2 className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                      {category.name}
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {catItems.length} {catItems.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
                  {catItems.map((item, itemIndex) => {
                    const isOddFinalCard = catItems.length % 2 === 1 && itemIndex === catItems.length - 1;
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "min-w-0",
                          isOddFinalCard && "sm:col-span-2 sm:mx-auto sm:w-1/2 xl:col-span-1 xl:mx-0 xl:w-full"
                        )}
                      >
                        <MenuItemCard
                          item={item}
                          searchQuery={searchQuery}
                          onSelect={(selected) => setSelectedItemForSheet(selected)}
                        />
                      </div>
                    );
                  })}
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
