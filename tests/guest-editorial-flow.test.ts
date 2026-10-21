import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Guest Editorial Flow Polish Verification", () => {
  const menuViewPath = path.resolve(process.cwd(), "src/components/guest/menu-view.tsx");
  const menuItemCardPath = path.resolve(process.cwd(), "src/components/guest/menu-item-card.tsx");
  const cartBarPath = path.resolve(process.cwd(), "src/components/guest/cart-bar.tsx");
  const itemDetailSheetPath = path.resolve(process.cwd(), "src/components/guest/item-detail-sheet.tsx");
  const cartSheetPath = path.resolve(process.cwd(), "src/components/guest/cart-sheet.tsx");
  const sheetPath = path.resolve(process.cwd(), "src/components/ui/sheet.tsx");
  const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");

  const menuViewCode = fs.readFileSync(menuViewPath, "utf-8");
  const menuItemCardCode = fs.readFileSync(menuItemCardPath, "utf-8");
  const cartBarCode = fs.readFileSync(cartBarPath, "utf-8");
  const itemDetailSheetCode = fs.readFileSync(itemDetailSheetPath, "utf-8");
  const cartSheetCode = fs.readFileSync(cartSheetPath, "utf-8");
  const sheetCode = fs.readFileSync(sheetPath, "utf-8");
  const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");

  it("1. menu-view.tsx has compact hero, scrollable sticky category tabs, responsive grid, and scroll-spy", () => {
    // Compact hero banner
    expect(menuViewCode).toContain("aria-label=\"Restaurant banner\"");
    expect(menuViewCode).toContain("table.tableNumber");
    expect(menuViewCode).toContain("restaurantName");
    expect(menuViewCode).toContain("font-serif text-2xl sm:text-3xl");

    // Sticky category rail matches the header height and exposes horizontal scroll affordance.
    expect(menuViewCode).toContain("sticky top-[60px]");
    expect(menuViewCode).toContain("canScrollCategoryRight");
    expect(menuViewCode).toContain("nav.scrollTo");

    // Wide desktop layout and balanced odd-numbered tablet rows.
    expect(menuViewCode).toContain("max-w-7xl");
    expect(menuViewCode).toContain("xl:grid-cols-3");
    expect(menuViewCode).toContain("sm:col-span-2 sm:mx-auto sm:w-1/2");

    // Pill tabs with sliding active indicator
    expect(menuViewCode).toContain("activeCategoryPill");
    expect(menuViewCode).toContain("motion.span");

    // Scroll-spy with IntersectionObserver
    expect(menuViewCode).toContain("IntersectionObserver");
    expect(menuViewCode).toContain("category-section-");
    expect(menuViewCode).toContain("scrollIntoView");
  });

  it("2. menu-item-card.tsx is image-led with 4:3 image, corner veg badge, Playfair typography, and min 44px circular '+' button", () => {
    // Compact mobile image ratio with 4:3 imagery on larger screens.
    expect(menuItemCardCode).toContain("aspect-[5/3]");
    expect(menuItemCardCode).toContain("sm:aspect-[4/3]");
    expect(menuItemCardCode).toContain("Image");
    expect(menuItemCardCode).toContain("imageLoading");
    expect(menuItemCardCode).toContain("onError");
    expect(menuItemCardCode).toContain("priority={item.sortOrder <= 3}");

    // Desktop hover zoom with motion-reduce guard
    expect(menuItemCardCode).toContain("sm:group-hover:scale-105");
    expect(menuItemCardCode).toContain("motion-reduce:transform-none");

    // Veg indicator on image corner
    expect(menuItemCardCode).toContain("VegIndicator");
    expect(menuItemCardCode).toContain("absolute top-3 left-3");

    // Editorial typography, with complete descriptions instead of mid-sentence ellipses.
    expect(menuItemCardCode).toContain("font-serif text-base font-bold");
    expect(menuItemCardCode).toContain("item.description");
    expect(menuItemCardCode).not.toContain("line-clamp-2");

    // One row price, prep time, circular '+' button
    expect(menuItemCardCode).toContain("Clock");
    expect(menuItemCardCode).toContain("prepTimeMinutes");
    expect(menuItemCardCode).toContain("Plus");
    expect(menuItemCardCode).toContain("min-h-[44px] min-w-[44px] rounded-full");

    // Sold Out and Customizable badges preserved
    expect(menuItemCardCode).toContain("Customizable");
    expect(menuItemCardCode).toContain("Sold Out");

    // Whole card is clickable
    expect(menuItemCardCode).toContain("onClick={() => {");
    expect(menuItemCardCode).toContain("if (isAvailable) onSelect(item);");
  });

  it("3. cart-bar.tsx has floating pill design and bump animation on count change", () => {
    // Floating pill
    expect(cartBarCode).toContain("rounded-full");
    expect(cartBarCode).toContain("fixed bottom-5");

    // Bump animation on count change
    expect(cartBarCode).toContain("isBumping");
    expect(cartBarCode).toContain("animate-bump");
    expect(cartBarCode).toContain("motion-reduce:transform-none");

    // Count and total INR
    expect(cartBarCode).toContain("totalCount");
    expect(cartBarCode).toContain("formatPaiseToINR(totalPaise)");
  });

  it("4. item-detail-sheet.tsx & cart-sheet.tsx feature image header, min 44px tap targets, and clear price breakdowns", () => {
    // Item detail sheet
    expect(itemDetailSheetCode).toContain("Freshly Prepared");
    expect(itemDetailSheetCode).toContain("min-h-[44px] min-w-[44px]"); // quantity steppers
    expect(itemDetailSheetCode).toContain("min-h-[48px]"); // CTA and modifiers
    expect(itemDetailSheetCode).toContain("modifierTotalPaise"); // clear price breakdown

    // Cart sheet
    expect(cartSheetCode).toContain("Your Table Order");
    expect(cartSheetCode).toContain("GST (5%)");
    expect(cartSheetCode).toContain("min-h-[44px] min-w-[44px]"); // steppers
    expect(cartSheetCode).toContain("min-h-[48px]"); // buttons
    expect(cartSheetCode).toContain("grandTotalPaise");

    // Focus trap and return intact in sheet.tsx
    expect(sheetCode).toContain("triggerRef.current");
    expect(sheetCode).toContain("FOCUSABLE_SELECTOR");
    expect(sheetCode).toContain("animate-sheet-slide-up");
  });

  it("5. CSS contains animate-sheet-slide-up and animate-bump with reduced-motion support", () => {
    expect(globalsCssCode).toContain("@keyframes sheet-slide-up");
    expect(globalsCssCode).toContain("@keyframes bump");
    expect(globalsCssCode).toContain(".animate-sheet-slide-up");
    expect(globalsCssCode).toContain(".animate-bump");
    expect(globalsCssCode).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("6. search and dietary filters show accessible live feedback and highlight query matches", () => {
    expect(menuViewCode).toContain('data-testid="menu-search-input"');
    expect(menuViewCode).toContain('aria-label="Search menu dishes"');
    expect(menuViewCode).toContain('aria-pressed={dietaryFilter === "all"}');
    expect(menuViewCode).toContain('aria-pressed={dietaryFilter === "veg"}');
    expect(menuViewCode).toContain('aria-pressed={dietaryFilter === "non-veg"}');
    expect(menuViewCode).toContain('aria-live="polite"');
    expect(menuViewCode).toContain('data-testid="clear-menu-filters"');
    expect(menuViewCode).toContain('searchQuery={searchQuery}');
    expect(menuItemCardCode).toContain('data-search-match="true"');
    expect(menuItemCardCode).toContain('new RegExp(`(${escapedQuery})`, "gi")');
  });

});
