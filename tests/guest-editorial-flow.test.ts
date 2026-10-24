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
  const pairingCardPath = path.resolve(process.cwd(), "src/components/guest/pairing-card.tsx");
  const pairingCardCode = fs.readFileSync(pairingCardPath, "utf-8");
  const cartBarCode = fs.readFileSync(cartBarPath, "utf-8");
  const itemDetailSheetCode = fs.readFileSync(itemDetailSheetPath, "utf-8");
  const cartSheetCode = fs.readFileSync(cartSheetPath, "utf-8");
  const sheetCode = fs.readFileSync(sheetPath, "utf-8");
  const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");

  it("1. menu-view.tsx removes the redundant QR hero, aligns category tabs, and keeps responsive grid/scroll-spy", () => {
    // The table menu begins directly with search/filters; the extra dining banner is gone.
    expect(menuViewCode).not.toContain("Table Dining");
    expect(menuViewCode).not.toContain("Order fresh from our kitchen");
    expect(menuViewCode).not.toContain('restaurantName = "Masala Lane"');

    // Search, category rail, and dish sections share the same content grid alignment.
    expect(menuViewCode).toContain("relative mx-auto w-full max-w-7xl px-3 sm:px-6 lg:px-8");
    expect(menuViewCode).toContain("mx-auto w-full max-w-7xl space-y-1.5 px-3 py-1.5 sm:space-y-3 sm:px-6 sm:py-3 lg:px-8");
    expect(menuViewCode).toContain("relative flex w-full max-w-2xl items-center");
    expect(menuViewCode).toContain("flex w-full max-w-2xl flex-nowrap items-center");
    expect(menuViewCode).not.toContain("mx-auto flex w-full max-w-2xl");

    // Bazaar-style category placards preserve the horizontal rail, counts, active state, and scroll controls.
    expect(menuViewCode).toContain('bg-[#14100E]/95');
    expect(menuViewCode).toContain('bg-[#1A1614]');
    expect(menuViewCode).toContain('items-center justify-center gap-2');
    expect(menuViewCode).toContain('font-serif text-sm font-semibold tracking-wide');
    expect(menuViewCode).not.toContain('SHOP {String(');
    expect(menuViewCode).toContain('aria-current={isActive ? "location" : undefined}');

    // Sticky category rail centers active tabs and has fades plus explicit arrow controls.
    expect(menuViewCode).toContain("sticky top-[61px] sm:top-[69px]");
    expect(menuViewCode).toContain("px-0 py-2.5 sm:py-3 no-scrollbar scroll-smooth");
    expect(menuViewCode).toContain("canScrollCategoryRight");
    expect(menuViewCode).toContain("nav.scrollTo");
    expect(menuViewCode).toContain("Scroll categories left");
    expect(menuViewCode).toContain("Scroll categories right");
    expect(menuViewCode).toContain("scrollCategoriesBy");

    // Three-column desktop grid preserves row-major left-to-right order without artificial holes.
    expect(menuViewCode).toContain("max-w-7xl");
    expect(menuViewCode).toContain("lg:grid-cols-3");
    const categoryGridStart = menuViewCode.indexOf("/* Desktop: strict row-major order keeps every category gap-free and left-to-right. */");
    const categoryGridEnd = menuViewCode.indexOf("</section>", categoryGridStart);
    const categoryGridCode = menuViewCode.slice(categoryGridStart, categoryGridEnd);
    expect(categoryGridCode).not.toContain("col-start");
    expect(menuViewCode).toContain("list.sort((a, b) => a.sortOrder - b.sortOrder");
    expect(menuViewCode).toContain('aria-label="Chef\'s picks" className="space-y-3 sm:space-y-4 pt-1"');
    expect(menuViewCode).toContain("CHEF&apos;S PICKS");
    expect(menuViewCode).toContain("hidden sm:grid sm:grid-flow-row sm:grid-cols-2 sm:items-stretch sm:gap-4 lg:grid-cols-3 lg:gap-5");

    // Pill tabs with sliding active indicator
    expect(menuViewCode).toContain("activeCategoryPill");
    expect(menuViewCode).toContain("motion.span");

    // Scroll-spy with IntersectionObserver
    expect(menuViewCode).toContain("IntersectionObserver");
    expect(menuViewCode).toContain("category-section-");
    expect(menuViewCode).toContain("scrollIntoView");
  });

  it("2. menu-item-card.tsx uses consistent poster proportions, readable image contrast, and min 44px circular '+' button", () => {
    // Consistent card image ratios and a lighter overlay keep food photography visible.
    expect(menuItemCardCode).toContain("aspect-[16/10]");
    expect(menuItemCardCode).toContain("rounded-2xl border border-[#3A302A] bg-[#1A1614]");
    expect(menuItemCardCode).toContain("bg-gradient-to-t from-[#1A1614]/85 via-transparent to-black/25");
    expect(menuItemCardCode).toContain("before:animate-pulse");
    expect(menuItemCardCode).toContain("duration-500 ease-out");
    expect(menuItemCardCode).toContain("h-full flex-col");
    expect(menuItemCardCode).toContain("line-clamp-3");
    expect(menuItemCardCode).toContain('data-testid="menu-item-details-btn"');
    expect(menuItemCardCode).toContain("aria-label={isAvailable ?");
    expect(menuItemCardCode).not.toContain('role={isAvailable ? "button" : undefined}');
    expect(menuItemCardCode).not.toContain("tabIndex={isAvailable ? 0 : undefined}");
    expect(menuItemCardCode).toContain("Image");
    expect(menuItemCardCode).toContain("imageLoading");
    expect(menuItemCardCode).toContain("onError");
    expect(menuItemCardCode).toContain("priority={priority || item.sortOrder <= 3}");

    // Desktop hover zoom with motion-reduce guard
    expect(menuItemCardCode).toContain("sm:group-hover:scale-105");
    expect(menuItemCardCode).toContain("motion-reduce:transform-none");

    // Veg indicator on image corner
    expect(menuItemCardCode).toContain("VegIndicator");
    expect(menuItemCardCode).toContain("absolute top-3 left-3");
    expect(menuItemCardCode).toContain('data-testid="spice-level-slot"');

    // Editorial typography, with complete descriptions instead of mid-sentence ellipses.
    expect(menuItemCardCode).toContain("font-serif text-xl font-bold");
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

    // Card details are keyboard reachable without nesting native buttons around cart controls.
    expect(menuItemCardCode).toContain('data-testid="menu-item-details-btn"');
    expect(menuItemCardCode).toContain('role="group"');
    expect(menuItemCardCode).toContain("tabIndex={isAvailable ? 0 : -1}");
    expect(menuItemCardCode).toContain("onClick={() => {");
    expect(menuItemCardCode).toContain("if (isAvailable) onSelect(item);");
  });

  it("3. cart-bar.tsx has floating pill design and bump animation on count change", () => {
    // Floating pill
    expect(cartBarCode).toContain("rounded-full");
    expect(cartBarCode).toContain("fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]");
    expect(cartBarCode).toContain("data-testid=\"cart-bar-btn\"");
    expect(cartBarCode).toContain("Browse dishes");
    expect(cartBarCode).toContain("mx-auto min-h-10 w-fit");

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
    expect(itemDetailSheetCode).toContain("FRESHLY PREPARED");
    expect(itemDetailSheetCode).toContain('side="center"');
    expect(itemDetailSheetCode).toContain("aria-label={`Close ${item.name} details`}");
    expect(itemDetailSheetCode).toContain("min-h-[44px] min-w-[44px]"); // quantity steppers
    expect(itemDetailSheetCode).toContain("min-h-[48px]"); // CTA and modifiers
    expect(itemDetailSheetCode).toContain("modifierTotalPaise"); // clear price breakdown

    // Cart sheet
    expect(cartSheetCode).toContain("Your Table Order");
    expect(cartSheetCode).toContain("GST (5%)");
    expect(cartSheetCode).toContain("min-h-[44px] min-w-[44px]"); // steppers
    expect(cartSheetCode).toContain("min-h-[48px]"); // buttons
    expect(cartSheetCode).toContain("grandTotalPaise");
    expect(cartSheetCode).toContain('data-testid="payment-choice-section"');
    expect(cartSheetCode).toContain('!isCheckingActiveTab && !isExistingDineInTab');
    expect(cartSheetCode).toContain('data-testid="existing-dine-in-tab-note"');
    expect(cartSheetCode).toContain('"Send to Kitchen"');
    expect(cartSheetCode).not.toContain('`Send ${activeTabRound');
    expect(cartSheetCode).toContain('router.push(`/t/${token}/order/${result.data.orderId}`)');
    expect(cartSheetCode).toContain('paymentsTestMode && paymentMethod !== "open_tab"');

    const customerServiceCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/server/services/customer.ts"),
      "utf-8"
    );
    const orderTrackerCode = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/guest/order-live-tracker.tsx"),
      "utf-8"
    );
    expect(customerServiceCode).toContain("diningSessionId: dbOrder.diningSessionId ?? null");
    expect(orderTrackerCode).toContain('order.diningSessionId ? "Open Dine-In Tab" : "Pay at Counter"');
    expect(orderTrackerCode).toContain('order.paymentStatus !== "counter" || Boolean(order.diningSessionId)');
    expect(orderTrackerCode).toContain('router.replace(`/t/${token}`)');
    expect(orderTrackerCode).toContain('data-testid="served-auto-return"');
    expect(orderTrackerCode).toContain('}, 4500);');

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

  it("7. recommendation labels use real category, order history, and spice modifier metadata", () => {
    const customerServicePath = path.resolve(process.cwd(), "src/server/services/customer.ts");
    const customerServiceCode = fs.readFileSync(customerServicePath, "utf-8");
    expect(menuViewCode).toContain('category.slug === "signature-curries"');
    expect(menuViewCode).toContain('isSignature={signatureCategoryIds.has(item.categoryId)}');
    expect(menuItemCardCode).toContain('item.isBestSeller');
    expect(menuItemCardCode).toContain('data-testid="spice-level-slot"');
    expect(menuItemCardCode).toContain('modifier.groupName');
    expect(customerServiceCode).toContain('gte(orders.createdAt, salesSince)');
    expect(customerServiceCode).toContain('SUM(${orderItems.quantity})');
    expect(customerServiceCode).toContain('Number(record.totalUnits) >= 5');
    expect(customerServiceCode).toContain('.limit(3)');
  });

  it("8. Chef's pairing uses real menu data, stored prices, and standard required modifiers", () => {
    expect(menuViewCode).toContain('import { PairingCard } from "./pairing-card"');
    expect(menuViewCode).toContain('/^(garlic butter|garlic) naan$/i');
    expect(menuViewCode).toContain('/burani.*raita/i');
    expect(menuViewCode).toContain('pairingItems && showPairing');
    expect(pairingCardCode).toContain('data-testid="pairing-card"');
    expect(pairingCardCode).toContain('data-testid="add-pairing-btn"');
    expect(pairingCardCode).toContain('formatPaiseToINR(totalPaise)');
    expect(pairingCardCode).toContain('standardModifierIds');
    expect(pairingCardCode).toContain('cart.addItem(bread.id, 1, breadModifiers)');
    expect(pairingCardCode).toContain('cart.addItem(side.id, 1, sideModifiers)');
    expect(pairingCardCode).toContain('bread.isAvailable && side.isAvailable');
  });

});
