// NOTE: Must be kept in sync with lib/limits.ts
export const MAX_PROMPT_CHARS = 4000; // keep in sync with lib/limits.ts
export const MAX_REWARDED_OPTIMIZATIONS_PER_DAY = 20; // Max rewarded optimizations per user per 24h
export const MAX_COINS_PER_DAY = 200; // Max coins a user can earn per 24h
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
