/**
 * Currency utilities for DinePulse.
 * All amounts internally are stored as integer paise (1 INR = 100 paise).
 */

/**
 * Formats integer paise into standard Indian Rupee string (e.g. 24900 -> ₹249 or ₹249.00).
 * Uses en-IN locale for Indian numbering system (lakhs/crores).
 */
export function formatPaiseToINR(
  paise: number,
  options?: { showDecimalsIfZero?: boolean }
): string {
  const rupees = paise / 100;
  const showDecimals = options?.showDecimalsIfZero ?? paise % 100 !== 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Converts decimal rupees input into integer paise (e.g. 199.50 -> 19950).
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise into decimal rupees.
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}
