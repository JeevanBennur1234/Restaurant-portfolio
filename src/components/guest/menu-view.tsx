"use client";

import * as React from "react";
import { MenuItemCard } from "./menu-item-card";
import { ItemDetailSheet } from "./item-detail-sheet";
import { CartBar } from "./cart-bar";
import { CartSheet } from "./cart-sheet";
import { VegIndicator } from "./veg-indicator";
import { Search, X, UtensilsCrossed } from "lucide-react";
import type { GuestCategory, GuestMenuItem, GuestTable } from "@/server/queries/guest";

export interface MenuViewProps {
  categories: GuestCategory[];
  items: GuestMenuItem[];
  table: GuestTable;
}

type DietaryFilter = "all" | "veg" | "non-veg";

export function MenuView({ categories, items, table }: MenuViewProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [dietaryFilter, setDietaryFilter] = React.useState<DietaryFilter>("all");
  const [activeCategoryId, setActiveCategoryId] = React.useState<string>(
    categories[0]?.id ?? ""
  );
  const [selectedItemForSheet, setSelectedItemForSheet] =
    React.useState<GuestMenuItem | null>(null);

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
    setActiveCategoryId(categoryId);
    const element = document.getElementById(`category-section-${categoryId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-28">
      {/* Search Bar & Veg/Non-Veg Filter Section */}
      <div className="bg-[var(--bg-surface)] px-4 py-3 border-b border-[var(--border-subtle)] space-y-3">
        {/* Search Input */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search our dishes, kebabs, curries..."
            className="h-10 w-full rounded-[var(--radius-full)] border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/70 pl-10 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:bg-[var(--bg-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-focus)] transition-colors"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dietary Filters Toggle */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-0.5">
          <button
            type="button"
            onClick={() => setDietaryFilter("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer select-none ${
              dietaryFilter === "all"
                ? "bg-[var(--secondary)] text-[var(--secondary-foreground)] border-[var(--secondary)]"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            All Items
          </button>

          <button
            type="button"
            onClick={() => setDietaryFilter("veg")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer select-none ${
              dietaryFilter === "veg"
                ? "bg-emerald-800 text-white border-emerald-800"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            <VegIndicator isVeg={true} size="sm" />
            <span>Veg Only</span>
          </button>

          <button
            type="button"
            onClick={() => setDietaryFilter("non-veg")}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer select-none ${
              dietaryFilter === "non-veg"
                ? "bg-amber-950 text-white border-amber-950"
                : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            <VegIndicator isVeg={false} size="sm" />
            <span>Non-Veg</span>
          </button>
        </div>
      </div>

      {/* Sticky Category Tabs Bar */}
      <nav
        aria-label="Menu categories"
        className="sticky top-[53px] z-20 flex gap-2 overflow-x-auto border-b border-[var(--border-subtle)] bg-[var(--bg-app)]/95 px-4 py-2.5 backdrop-blur-md no-scrollbar shadow-2xs"
      >
        {categories.map((cat) => {
          const count = itemsByCategory.get(cat.id)?.length ?? 0;
          const isActive = activeCategoryId === cat.id;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(cat.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium tracking-wide transition-all cursor-pointer select-none ${
                isActive
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-xs font-semibold"
                  : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {cat.name}
              {count > 0 && (
                <span
                  className={`ml-1.5 text-[10px] font-mono ${
                    isActive ? "opacity-90" : "opacity-60"
                  }`}
                >
                  ({count})
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Menu Sections & Item Cards */}
      <main className="p-4 space-y-8 max-w-2xl mx-auto w-full">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[var(--text-muted)]">
            <UtensilsCrossed className="h-10 w-10 opacity-30 text-[var(--primary)] mb-3" />
            <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
              No dishes found
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-xs">
              {searchQuery
                ? `No dishes matching "${searchQuery}". Try a different keyword.`
                : "No dishes currently match the selected dietary filter."}
            </p>
          </div>
        ) : (
          categories.map((category) => {
            const catItems = itemsByCategory.get(category.id) ?? [];
            if (catItems.length === 0) return null;

            return (
              <section
                key={category.id}
                id={`category-section-${category.id}`}
                className="scroll-mt-28 space-y-3"
              >
                <div className="flex items-baseline justify-between border-b border-[var(--border-subtle)] pb-2">
                  <h2 className="font-serif text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    {category.name}
                  </h2>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    {catItems.length} {catItems.length === 1 ? "item" : "items"}
                  </span>
                </div>

                <div className="space-y-3">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onSelect={(selected) => setSelectedItemForSheet(selected)}
                    />
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
      <CartSheet tableLabel={table.tableNumber} token={table.qrToken} />

      {/* Sticky Bottom "View Cart" Bar */}
      <CartBar />
    </div>
  );
}
