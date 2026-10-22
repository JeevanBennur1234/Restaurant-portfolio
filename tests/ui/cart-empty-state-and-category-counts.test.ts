import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const root = process.cwd();
const menuView = fs.readFileSync(path.resolve(root, "src/components/guest/menu-view.tsx"), "utf-8");
const cartSheet = fs.readFileSync(path.resolve(root, "src/components/guest/cart-sheet.tsx"), "utf-8");

describe("category labels and empty cart recovery", () => {
  it("removes specialty totals and numeric count chips from every category label", () => {
    expect(menuView).not.toContain('catItems.length === 1 ? "specialty" : "specialties"');
    expect(menuView).not.toContain('{count}</span>');
    const navStart = menuView.indexOf('aria-label="Menu categories"');
    const navEnd = menuView.indexOf("</nav>", navStart);
    const categoryNav = menuView.slice(navStart, navEnd);
    expect(categoryNav).toContain("{cat.name}");
    expect(categoryNav).not.toContain("itemsByCategory.get(cat.id)?.length");
    expect(categoryNav).not.toContain("{count}");
  });

  it("shows a cancel/back-to-menu action when the cart becomes empty", () => {
    expect(cartSheet).toContain('data-testid="empty-cart-cancel"');
    expect(cartSheet).toContain("Cancel / Back to menu");
    expect(cartSheet).toContain("onClick={() => setIsCartOpen(false)}");
    expect(cartSheet).toContain("Your cart is empty");
  });
});
