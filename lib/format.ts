/**
 * Shared formatting utilities for Nemora.
 */

/**
 * Formats CO2 amount in grams according to display rules:
 * - Under 10 g: 2 decimals (e.g. "0.12")
 * - 10 to 999 g: 1 decimal (e.g. "12.3")
 * - 1000 g and above: thousands separators with 1 decimal (e.g. "1,234.5")
 */
export function formatGrams(g: number): string {
  const val = Number.isFinite(g) ? Math.max(0, g) : 0;
  if (val < 10) {
    return val.toFixed(2);
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(val);
}
