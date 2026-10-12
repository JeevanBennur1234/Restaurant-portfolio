import { describe, it, expect } from "vitest";
import {
  calculateOrderTotals,
  type CalculableItem,
} from "@/lib/pricing";
import {
  formatPaiseToINR,
  rupeesToPaise,
  paiseToRupees,
} from "@/lib/currency";

describe("Money and Tax Calculations", () => {
  describe("calculateOrderTotals - Integer Paise & 5% GST", () => {
    it("correctly computes totals for a single item without modifiers", () => {
      const items: CalculableItem[] = [
        { itemPricePaise: 25000, quantity: 2 }, // 2 × ₹250 = ₹500
      ];

      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(50000); // ₹500
      expect(result.taxPaise).toBe(2500); // 5% of ₹500 = ₹25
      expect(result.totalPaise).toBe(52500); // ₹525
      expect(Number.isInteger(result.subtotalPaise)).toBe(true);
      expect(Number.isInteger(result.taxPaise)).toBe(true);
      expect(Number.isInteger(result.totalPaise)).toBe(true);
    });

    it("correctly adds modifier prices to unit prices before multiplying by quantity", () => {
      const items: CalculableItem[] = [
        {
          itemPricePaise: 32000, // ₹320 (Paneer Butter Masala)
          quantity: 2,
          modifiers: [
            { pricePaise: 3000 }, // Extra Butter: ₹30
            { pricePaise: 2000 }, // Spicy: ₹20
          ],
        },
      ];

      // Unit price = 32000 + 3000 + 2000 = 37000 paise (₹370)
      // Line total = 37000 * 2 = 74000 paise (₹740)
      // 5% GST = 74000 * 0.05 = 3700 paise (₹37)
      // Total = 74000 + 3700 = 77700 paise (₹777)
      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(74000);
      expect(result.taxPaise).toBe(3700);
      expect(result.totalPaise).toBe(77700);
    });

    it("handles multiple items with and without modifiers", () => {
      const items: CalculableItem[] = [
        {
          itemPricePaise: 28000, // ₹280 Dal Makhani
          quantity: 1,
        },
        {
          itemPricePaise: 5000, // ₹50 Butter Naan
          quantity: 3,
          modifiers: [{ pricePaise: 1000 }], // Garlic add-on: ₹10 -> ₹60
        },
      ];

      // Item 1: 28000 * 1 = 28000
      // Item 2: (5000 + 1000) * 3 = 18000
      // Subtotal = 28000 + 18000 = 46000 paise (₹460)
      // 5% GST = Math.round(46000 * 0.05) = 2300 paise (₹23)
      // Total = 46000 + 2300 = 48300 paise (₹483)
      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(46000);
      expect(result.taxPaise).toBe(2300);
      expect(result.totalPaise).toBe(48300);
    });

    it("handles 5% GST rounding down (e.g. fractional paise < 0.5)", () => {
      // Subtotal = 101 paise -> 101 * 0.05 = 5.05 paise -> rounds to 5 paise
      const items: CalculableItem[] = [{ itemPricePaise: 101, quantity: 1 }];

      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(101);
      expect(result.taxPaise).toBe(5);
      expect(result.totalPaise).toBe(106);
    });

    it("handles 5% GST rounding up (e.g. fractional paise >= 0.5)", () => {
      // Subtotal = 110 paise -> 110 * 0.05 = 5.5 paise -> rounds to 6 paise
      const items: CalculableItem[] = [{ itemPricePaise: 110, quantity: 1 }];

      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(110);
      expect(result.taxPaise).toBe(6);
      expect(result.totalPaise).toBe(116);
    });

    it("handles zero-cost modifiers correctly", () => {
      const items: CalculableItem[] = [
        {
          itemPricePaise: 15000,
          quantity: 1,
          modifiers: [{ pricePaise: 0 }], // Free modifier
        },
      ];

      const result = calculateOrderTotals(items);

      expect(result.subtotalPaise).toBe(15000);
      expect(result.taxPaise).toBe(750);
      expect(result.totalPaise).toBe(15750);
    });

    it("returns zero for an empty list of items", () => {
      const result = calculateOrderTotals([]);

      expect(result.subtotalPaise).toBe(0);
      expect(result.taxPaise).toBe(0);
      expect(result.totalPaise).toBe(0);
    });
  });

  describe("Currency Formatting & Conversion (src/lib/currency.ts)", () => {
    it("formatPaiseToINR formats whole rupee amounts cleanly", () => {
      const formatted = formatPaiseToINR(24900);
      // Clean string with currency symbol and 249
      expect(formatted).toMatch(/₹\s?249/);
      expect(formatted).not.toContain(".00");
    });

    it("formatPaiseToINR formats fractional rupee amounts with 2 decimal digits", () => {
      const formatted = formatPaiseToINR(24950);
      expect(formatted).toMatch(/₹\s?249\.50/);
    });

    it("formatPaiseToINR respects showDecimalsIfZero option", () => {
      const formatted = formatPaiseToINR(24900, { showDecimalsIfZero: true });
      expect(formatted).toMatch(/₹\s?249\.00/);
    });

    it("formatPaiseToINR handles Indian numbering system for lakhs", () => {
      const formatted = formatPaiseToINR(15000000); // ₹1,50,000 (1.5 Lakhs)
      expect(formatted).toMatch(/1,50,000/);
    });

    it("rupeesToPaise converts decimal rupees to integer paise without floating point error", () => {
      expect(rupeesToPaise(199)).toBe(19900);
      expect(rupeesToPaise(199.5)).toBe(19950);
      expect(rupeesToPaise(0.7)).toBe(70); // 0.7 * 100 is 70.00000000000001 in float
      expect(rupeesToPaise(1.14)).toBe(114);
      expect(Number.isInteger(rupeesToPaise(199.5))).toBe(true);
    });

    it("paiseToRupees converts integer paise to decimal rupees", () => {
      expect(paiseToRupees(19900)).toBe(199);
      expect(paiseToRupees(19950)).toBe(199.5);
      expect(paiseToRupees(50)).toBe(0.5);
    });
  });
});
