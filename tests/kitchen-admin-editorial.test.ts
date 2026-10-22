import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Kitchen & Admin UI Tokens and Editorial Polish", () => {
  const kitchenTicketPath = path.resolve(process.cwd(), "src/components/kitchen/kitchen-ticket.tsx");
  const kitchenLoginPath = path.resolve(process.cwd(), "src/components/kitchen/kitchen-login.tsx");
  const adminNavbarPath = path.resolve(process.cwd(), "src/components/admin/admin-navbar.tsx");
  const adminReportsPath = path.resolve(process.cwd(), "src/components/admin/admin-reports-tab.tsx");
  const adminOrdersPath = path.resolve(process.cwd(), "src/components/admin/admin-orders-tab.tsx");
  const adminMenuPath = path.resolve(process.cwd(), "src/components/admin/admin-menu-tab.tsx");
  const adminTablesPath = path.resolve(process.cwd(), "src/components/admin/admin-tables-tab.tsx");
  const adminLoginPath = path.resolve(process.cwd(), "src/components/admin/admin-login.tsx");
  const globalsCssPath = path.resolve(process.cwd(), "src/app/globals.css");

  const kitchenTicketCode = fs.readFileSync(kitchenTicketPath, "utf-8");
  const kitchenLoginCode = fs.readFileSync(kitchenLoginPath, "utf-8");
  const adminNavbarCode = fs.readFileSync(adminNavbarPath, "utf-8");
  const adminReportsCode = fs.readFileSync(adminReportsPath, "utf-8");
  const adminOrdersCode = fs.readFileSync(adminOrdersPath, "utf-8");
  const adminMenuCode = fs.readFileSync(adminMenuPath, "utf-8");
  const adminTablesCode = fs.readFileSync(adminTablesPath, "utf-8");
  const adminLoginCode = fs.readFileSync(adminLoginPath, "utf-8");
  const globalsCssCode = fs.readFileSync(globalsCssPath, "utf-8");

  it("Kitchen Ticket: bolder header, large table display size, status band, single-run pulse, multi-modal timer", () => {
    // 1. Table label in large display size
    expect(kitchenTicketCode).toContain("ticket.tableNumber");
    expect(kitchenTicketCode).toContain("font-serif text-2xl sm:text-3xl font-extrabold");

    // 2. Status colour band on left edge of ticket
    expect(kitchenTicketCode).toContain("statusBandColor");
    expect(kitchenTicketCode).toContain("absolute left-0 top-0 bottom-0 w-2 rounded-l-xl");

    // 3. Smooth highlight pulse that runs once (not infinite flashing)
    expect(kitchenTicketCode).toContain("animate-highlight-once");
    expect(globalsCssCode).toContain("@keyframes highlight-pulse-once");
    expect(globalsCssCode).toContain(".animate-highlight-once");

    // 4. Timer does not rely on colour alone: distinct icons & explicit labels
    expect(kitchenTicketCode).toContain("10m+ Wait");
    expect(kitchenTicketCode).toContain("15m+ Delayed");
    expect(kitchenTicketCode).toContain("AlertTriangle");
    expect(kitchenTicketCode).toContain("Flame");

    // 5. Large touch targets (min 48px)
    expect(kitchenTicketCode).toContain("min-h-[48px]");
  });

  it("Admin Navbar: cleaner tab navigation with clear active state and focus rings", () => {
    // Reference-matched active terracotta tab and dark inactive navigation tiles.
    expect(adminNavbarCode).toContain("bg-[#C85A32] text-white shadow-md shadow-[#C85A32]/20 font-semibold");
    expect(adminNavbarCode).toContain("text-[#F4EFEA]");
    expect(adminNavbarCode).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,2.2fr)_minmax(0,1fr)]");
    expect(adminNavbarCode).toContain("hidden min-w-0 lg:grid grid-cols-4");
    expect(adminNavbarCode).toContain("whitespace-normal break-words");
    expect(adminNavbarCode).toContain("flex lg:hidden overflow-x-auto");
    expect(adminNavbarCode).toContain("hidden xl:inline-flex");
    expect(adminNavbarCode).toContain("hidden 2xl:inline-flex");
    // Keyboard focus remains clearly visible on tabs.
    expect(adminNavbarCode).toContain("focus-visible:ring-2 focus-visible:ring-[#C85A32]");
  });

  it("Admin Reports: KPI cards with large numerals and brand-coloured 7-day chart", () => {
    // Large numerals in KPI cards
    expect(adminReportsCode).toContain("font-serif text-3xl sm:text-4xl font-extrabold");

    // Brand-coloured 7-day chart
    expect(adminReportsCode).toContain("bg-[var(--primary)]");
    expect(adminReportsCode).toContain("bg-[var(--accent)]");
    expect(adminReportsCode).toContain("7-Day Revenue");
  });

  it("Admin Tables: horizontal scrolling container with min-w and row hover/focus states", () => {
    // Orders tab horizontal scroll container and min-width
    expect(adminOrdersCode).toContain("w-full overflow-x-auto");
    expect(adminOrdersCode).toContain("min-w-[760px]");
    expect(adminOrdersCode).toContain("hover:bg-[var(--bg-subtle)]/80");
    expect(adminOrdersCode).toContain("focus-within:bg-[var(--bg-subtle)]/80");

    // Menu tab horizontal scroll container and min-width
    expect(adminMenuCode).toContain("w-full overflow-x-auto");
    expect(adminMenuCode).toContain("min-w-[720px]");
    expect(adminMenuCode).toContain("hover:bg-[var(--bg-subtle)]/80");

    // Reports top items table horizontal scroll container
    expect(adminReportsCode).toContain("w-full overflow-x-auto");
    expect(adminReportsCode).toContain("min-w-[540px]");

    // Tables tab cards hover and focus-visible states
    expect(adminTablesCode).toContain("hover:border-[var(--primary)]");
    expect(adminTablesCode).toContain("focus-visible:ring-[var(--primary)]");
  });

  it("Login screens: styled to match design system with authentic credential authentication", () => {
    // Kitchen login styling and credential inputs
    expect(kitchenLoginCode).toContain("Masala Lane Kitchen");
    expect(kitchenLoginCode).toContain('data-testid="kitchen-username-input"');
    expect(kitchenLoginCode).toContain('data-testid="kitchen-password-input"');
    expect(kitchenLoginCode).toContain('data-testid="kitchen-login-btn"');

    // Admin login styling and credential inputs
    expect(adminLoginCode).toContain("Masala Lane Hub");
    expect(adminLoginCode).toContain('data-testid="admin-username-input"');
    expect(adminLoginCode).toContain('data-testid="admin-password-input"');
    expect(adminLoginCode).toContain('data-testid="admin-login-btn"');
  });
});
