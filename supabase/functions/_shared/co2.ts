/**
 * Nemora Shared CO2 Emission & Token Calculation Model
 * 
 * Single source of truth for carbon calculations across Supabase Edge Functions
 * and Next.js frontend client.
 * 
 * === Carbon & Energy Modeling Assumptions ===
 * 1. TOKENS_PER_WORD (1.3):
 *    Average subword token expansion factor for English text in standard LLM tokenizers (BPE / SentencePiece).
 * 
 * 2. ENERGY_KWH_PER_TOKEN (0.0003 kWh / token):
 *    Estimated datacenter electrical energy consumed per generated / processed token.
 *    Based on published datacenter inference energy benchmarks across modern tensor accelerator clusters.
 *    Adjust this constant if targeting specific quantized hardware (e.g. TPU v5e or H100 SXM5).
 * 
 * 3. GRID_KG_PER_KWH (0.45 kg CO2e / kWh):
 *    Global average grid carbon emission intensity factor (~450g CO2e / kWh, IEA global average).
 *    In regions with 100% renewable datacenters, this figure would be lower (~0.05 - 0.10).
 * 
 * 4. CO2 RATING CUTOFFS:
 *    - Green (Eco):    <= 0.010g CO2 (~25 tokens, minimal compute footprint)
 *    - Yellow (Moderate): > 0.010g and <= 0.050g CO2 (~25 to ~125 tokens)
 *    - Red (Heavy):    > 0.050g CO2 (>125 tokens, high prompt density warranting compression)
 */

export const TOKENS_PER_WORD = 1.3;
export const ENERGY_KWH_PER_TOKEN = 0.0003;
export const GRID_KG_PER_KWH = 0.45;

/**
 * Thresholds in grams of CO2 for prompt rating badges and UI gauge visuals
 */
export const CO2_RATING_THRESHOLDS = {
  GREEN_MAX: 0.010,
  YELLOW_MAX: 0.050,
} as const;

export type CO2Rating = 'green' | 'yellow' | 'red';

/**
 * Estimates LLM token count from raw text using word-boundary splitting.
 */
export function estimateTokens(text: string): number {
  if (!text || !text.trim()) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return Math.ceil(words.length * TOKENS_PER_WORD);
}

/**
 * Calculates raw CO2 emissions in grams for a given token count.
 */
export function estimateCO2(tokens: number): number {
  if (tokens <= 0) return 0;
  const rawGrams = tokens * ENERGY_KWH_PER_TOKEN * GRID_KG_PER_KWH;
  return formatCO2(rawGrams);
}

/**
 * Formats a CO2 value rounded to exactly 3 decimal places.
 */
export function formatCO2(co2Grams: number): number {
  return parseFloat(Math.max(0, co2Grams).toFixed(3));
}

/**
 * Determines environmental rating badge based on CO2 emissions in grams.
 */
export function getCO2Rating(co2Grams: number): CO2Rating {
  if (co2Grams <= CO2_RATING_THRESHOLDS.GREEN_MAX) return 'green';
  if (co2Grams <= CO2_RATING_THRESHOLDS.YELLOW_MAX) return 'yellow';
  return 'red';
}
