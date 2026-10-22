import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Design System, Typography & Panel Positioning Regression Suite", () => {
  const root = process.cwd();

  const menuViewCode = fs.readFileSync(path.resolve(root, "src/components/guest/menu-view.tsx"), "utf-8");
  const guestHeaderCode = fs.readFileSync(path.resolve(root, "src/components/guest/guest-header.tsx"), "utf-8");
  const menuItemCardCode = fs.readFileSync(path.resolve(root, "src/components/guest/menu-item-card.tsx"), "utf-8");
  const itemDetailSheetCode = fs.readFileSync(path.resolve(root, "src/components/guest/item-detail-sheet.tsx"), "utf-8");
  const pairingCardCode = fs.readFileSync(path.resolve(root, "src/components/guest/pairing-card.tsx"), "utf-8");
  const cartSheetCode = fs.readFileSync(path.resolve(root, "src/components/guest/cart-sheet.tsx"), "utf-8");
  const sheetCode = fs.readFileSync(path.resolve(root, "src/components/ui/sheet.tsx"), "utf-8");
  const buttonCode = fs.readFileSync(path.resolve(root, "src/components/ui/button.tsx"), "utf-8");
  const inputCode = fs.readFileSync(path.resolve(root, "src/components/ui/input.tsx"), "utf-8");
  const kitchenTicketCode = fs.readFileSync(path.resolve(root, "src/components/kitchen/kitchen-ticket.tsx"), "utf-8");
  const kitchenBoardCode = fs.readFileSync(path.resolve(root, "src/components/kitchen/kitchen-board.tsx"), "utf-8");
  const kitchenHeaderCode = fs.readFileSync(path.resolve(root, "src/components/kitchen/kitchen-header.tsx"), "utf-8");
  const adminNavbarCode = fs.readFileSync(path.resolve(root, "src/components/admin/admin-navbar.tsx"), "utf-8");
  const adminOrdersCode = fs.readFileSync(path.resolve(root, "src/components/admin/admin-orders-tab.tsx"), "utf-8");
  const adminMenuCode = fs.readFileSync(path.resolve(root, "src/components/admin/admin-menu-tab.tsx"), "utf-8");
  const adminTablesCode = fs.readFileSync(path.resolve(root, "src/components/admin/admin-tables-tab.tsx"), "utf-8");
  const adminReportsCode = fs.readFileSync(path.resolve(root, "src/components/admin/admin-reports-tab.tsx"), "utf-8");
  const receiptViewCode = fs.readFileSync(path.resolve(root, "src/components/common/receipt-view.tsx"), "utf-8");
  const globalStylesCode = fs.readFileSync(path.resolve(root, "src/app/globals.css"), "utf-8");
  const guestTablePageCode = fs.readFileSync(path.resolve(root, "src/app/t/[token]/page.tsx"), "utf-8");
  const guestOrderPageCode = fs.readFileSync(path.resolve(root, "src/app/t/[token]/order/[id]/page.tsx"), "utf-8");

  describe("1. Customer UI Branding & Grid Structure", () => {
    it("preserves restaurant branding in GuestHeader while removing duplicated title in MenuView hero", () => {
      // Navbar retains the restaurant branding
      expect(guestHeaderCode).toContain("{restaurantName}");
      expect(guestHeaderCode).toContain("font-serif");

      // Hero banner replaces duplicated heading with concise, useful ordering message
      expect(menuViewCode).toContain("Order fresh from our kitchen");
      // Does not contain duplicated large hero h1 displaying restaurantName
      expect(menuViewCode).not.toContain("<h1>{restaurantName}</h1>");
      expect(menuViewCode).not.toContain("<h1 className=\"font-serif text-lg sm:text-3xl font-bold tracking-tight text-[#FAF7F2] leading-tight flex items-center gap-2\">");
    });

    it("enforces row-major grid flow without artificial blank holes or centering offset columns", () => {
      // Products flow consistently left-to-right, top-to-bottom
      expect(menuViewCode).toContain("grid-flow-row sm:grid-cols-2 sm:items-stretch sm:gap-4 lg:grid-cols-3 lg:gap-5");
      // Category product grids remain row-major; only the standalone pairing card may be centered in an incomplete final row.
      const categoryGridStart = menuViewCode.indexOf("/* Desktop: strict row-major order keeps every category gap-free and left-to-right. */");
      const categoryGridEnd = menuViewCode.indexOf("</section>", categoryGridStart);
      const categoryGridCode = menuViewCode.slice(categoryGridStart, categoryGridEnd);
      expect(categoryGridCode).not.toContain("col-start");
      expect(menuViewCode).toContain("lg:col-start-2");
      expect(menuViewCode).not.toContain("sm:col-span-2 sm:mx-auto sm:w-1/2");
    });
  });

  describe("2. Panel Positioning & Mobile/Desktop Sizing", () => {
    it("configures Sheet side='center' as responsive centered dialog on desktop and full-featured panel on mobile", () => {
      // Desktop: centered modal dialog with sm:top-1/2, sm:left-1/2, and constrained max dimensions
      expect(sheetCode).toContain("sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2");
      expect(sheetCode).toContain("sm:rounded-[var(--radius-xl)]");

      // Mobile: bottom-anchored panel with slide-up animation
      expect(sheetCode).toContain("inset-x-0 bottom-0");
      expect(sheetCode).toContain("animate-sheet-slide-up");

      // Locks body scrolling and prevents scroll chaining
      expect(sheetCode).toContain("document.body.style.overflow = \"hidden\"");
      expect(sheetCode).toContain("document.body.style.overscrollBehavior = \"none\"");
    });

    it("ensures item detail and cart panels use side='center' and accessible close affordance", () => {
      expect(itemDetailSheetCode).toContain('side="center"');
      expect(cartSheetCode).toContain('side="center"');
      expect(itemDetailSheetCode).toContain('aria-label={`Close ${item.name} details`}');
    });
  });

  describe("3. Global Typography & Minimum Legibility Targets", () => {
    it("maintains readable dish card titles (18-22px) and prominent prices (20-24px)", () => {
      expect(menuItemCardCode).toContain("font-serif text-xl font-bold");
      expect(menuItemCardCode).toContain("font-serif text-2xl font-bold text-amber-300 sm:text-[1.75rem]");
    });

    it("ensures form inputs use 16px (text-base) to prevent iOS auto-zoom and maximize legibility", () => {
      expect(inputCode).toContain("text-base");
      expect(buttonCode).toContain("min-h-[44px]");
    });

    it("elevates KDS ticket glanceability for kitchen counters", () => {
      // High-visibility item names
      expect(kitchenTicketCode).toContain("text-base sm:text-lg font-bold text-zinc-100");
      // High-visibility item quantity badge
      expect(kitchenTicketCode).toContain("text-base font-black font-mono text-amber-400");
      // Column queue headers
      expect(kitchenBoardCode).toContain("text-base font-bold tracking-wider uppercase text-zinc-100 font-mono");
      // KDS Header status indicators
      expect(kitchenHeaderCode).toContain("text-sm font-mono");
    });

    it("ensures Manager dashboard tables and forms use readable typography hierarchy", () => {
      // Admin navbar tab typography
      expect(adminNavbarCode).toContain("text-sm transition-all cursor-pointer");
      expect(adminNavbarCode).toContain("min-h-[40px]");

      // Admin orders table
      expect(adminOrdersCode).toContain("text-sm border-collapse min-w-[760px]");
      expect(adminOrdersCode).toContain("text-xs tracking-wider");
      expect(adminOrdersCode).toContain("text-sm sm:text-base");

      // Admin menu table
      expect(adminMenuCode).toContain("text-sm border-collapse min-w-[720px]");
      expect(adminMenuCode).toContain("text-sm sm:text-base");

      // Admin tables cards
      expect(adminTablesCode).toContain("font-serif text-lg sm:text-xl font-bold");

      // Admin reports KPI cards
      expect(adminReportsCode).toContain("font-serif text-3xl sm:text-4xl font-extrabold");
    });
  });

  describe("4. Receipt Print Isolation & Brand Navigation", () => {
    it("makes the Customer brand mark return to the active table menu", () => {
      expect(guestHeaderCode).toContain('data-testid="guest-brand-home-link"');
      expect(guestHeaderCode).toContain("href={homeHref}");
      expect(guestHeaderCode).toContain('homeHref = "/"');
      expect(guestTablePageCode).toContain("homeHref={`/t/${token}`}");
      expect(guestOrderPageCode).toContain("homeHref={`/t/${token}`}");
    });

    it("makes the Manager brand mark a link to the public restaurant home page", () => {
      expect(adminNavbarCode).toContain('data-testid="admin-brand-home-link"');
      expect(adminNavbarCode).toContain("href={brandHomeUrl}");
      expect(adminNavbarCode).toContain('resolveSiteUrl("customer", "/")');
    });

    it("uses an uncropped 4:3 dark editorial item modal with readable metadata and terracotta CTA", () => {
      expect(itemDetailSheetCode).toContain('aspect-[4/3] w-full overflow-hidden bg-[#241E1A]');
      expect(itemDetailSheetCode).toContain('className="object-contain"');
      expect(itemDetailSheetCode).toContain('bg-[#181412] text-[#FAF7F2]');
      expect(itemDetailSheetCode).toContain('border border-[#3A3026]');
      expect(itemDetailSheetCode).toContain('Masala Lane &middot; Heritage Kitchen');
      expect(itemDetailSheetCode).toContain('from-[#C85A32] to-[#B34B24]');
      // Derive accessible names from the visible content so WCAG label-content-name-match passes.
      expect(guestHeaderCode).not.toContain('aria-label={`Return to ${restaurantName} main page`');
      expect(pairingCardCode).not.toContain('aria-label={`Add standard pair:');
      expect(pairingCardCode).toContain('<span>{canAdd ? "Add standard pair" : "Currently unavailable"}</span>');
    });

    it("prints only the bill/receipt instead of the manager page behind its modal", () => {
      expect(receiptViewCode).toContain('id="receipt-print-root"');
      expect(receiptViewCode).toContain('data-receipt-content="true"');
      expect(globalStylesCode).toContain("body * {");
      expect(globalStylesCode).toContain("visibility: hidden !important");
      expect(globalStylesCode).toContain("#receipt-print-root,");
      expect(globalStylesCode).toContain("#receipt-print-root .print\\:hidden");
      expect(globalStylesCode).toContain('data-print-layout="thermal"');
    });
  });

  describe("5. Essential Actions & Tap Target Standards", () => {
    it("provides accessible min 44px tap targets for cart, stepper, and checkout CTAs", () => {
      // Quantity steppers
      expect(itemDetailSheetCode).toContain("min-h-[44px] min-w-[44px]");
      expect(cartSheetCode).toContain("min-h-[44px] min-w-[44px]");

      // Primary add to order and checkout buttons
      expect(itemDetailSheetCode).toContain("min-h-[52px]");
      expect(cartSheetCode).toContain("min-h-[52px]");

      // Quick add circular button on menu item card
      expect(menuItemCardCode).toContain("min-h-[44px] min-w-[44px]");
    });
  });
});
