/**
 * DinePulse Centralized Pricing & Money Calculation Module.
 * All monetary amounts are integer paise (1 INR = 100 paise).
 * 
 * Rules:
 * - Subtotal: sum of (itemPricePaise + sum(modifierPricePaise)) * quantity
 * - Tax: strictly 5% GST rounded to nearest integer paise: Math.round(subtotalPaise * 0.05)
 * - Total: subtotalPaise + taxPaise
 * - Zero floating point arithmetic leaks
 */

export interface CalculableModifier {
  pricePaise: number;
}

export interface CalculableItem {
  itemPricePaise: number;
  quantity: number;
  modifiers?: CalculableModifier[];
}

export interface OrderPricingResult {
  subtotalPaise: number;
  taxPaise: number;
  totalPaise: number;
}

export function calculateOrderTotals(items: CalculableItem[]): OrderPricingResult {
  let subtotalPaise = 0;

  for (const item of items) {
    let unitPaise = item.itemPricePaise;
    if (item.modifiers && item.modifiers.length > 0) {
      for (const mod of item.modifiers) {
        unitPaise += Math.round(mod.pricePaise);
      }
    }
    const lineTotal = Math.round(unitPaise) * Math.round(item.quantity);
    subtotalPaise += lineTotal;
  }

  const taxPaise = Math.round(subtotalPaise * 0.05);
  const totalPaise = subtotalPaise + taxPaise;

  return {
    subtotalPaise,
    taxPaise,
    totalPaise,
  };
}
