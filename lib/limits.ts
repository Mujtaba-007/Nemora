// NOTE: Must be kept in sync with supabase/functions/_shared/limits.ts
export const MAX_PROMPT_WORDS = 500;

export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
