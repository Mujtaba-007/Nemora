import { create } from 'zustand';
import {
  estimateTokens,
  estimateCO2,
  formatCO2,
  CO2_RATING_THRESHOLDS,
  getCO2Rating,
} from './co2';

// Re-export for any legacy imports
export { estimateTokens, estimateCO2, formatCO2, CO2_RATING_THRESHOLDS, getCO2Rating };
export const calculateCO2 = estimateCO2;

interface CO2State {
  currentPrompt: string;
  currentCO2: number;
  totalCO2Saved: number;
  co2History: { date: string; saved: number }[];
  gardenStats: { treeId: number; co2Saved: number; plantedDate: string }[];
  leaderboard: { rank: number; name: string; score: number; co2Saved: number }[];
  dailyChallenge: {
    id?: string;
    title: string;
    description: string;
    targetScore: number;
    currentCode: string;
    efficiencyScore: number;
  };
  draftPrompt: string;
  activeScreen: number;
  setCurrentPrompt: (prompt: string) => void;
  addCO2Saved: (amount: number) => void;
  setTotalCO2Saved: (amount: number) => void;
  updateDailyChallengeCode: (code: string) => void;
  setDraftPrompt: (prompt: string) => void;
  setActiveScreen: (idx: number) => void;
}

export const useCO2Store = create<CO2State>((set, get) => ({
  currentPrompt: '',
  currentCO2: 0,
  totalCO2Saved: 0,
  co2History: [],
  gardenStats: [],
  leaderboard: [],
  dailyChallenge: {
    title: 'Optimize API Calls',
    description: 'Reduce the number of API calls by implementing efficient caching and batching',
    targetScore: 90,
    currentCode: `// Optimize this function
async function fetchData(ids) {
  const results = [];
  for (const id of ids) {
    const res = await fetch(\`/api/item/\${id}\`);
    results.push(await res.json());
  }
  return results;
}`,
    efficiencyScore: 45,
  },
  draftPrompt: '',
  activeScreen: 0,
  /**
   * Client-side prompt analysis: computes tokens and CO2 instantaneously (<10ms)
   * with zero external network requests.
   */
  setCurrentPrompt: (prompt: string) => {
    const tokens = estimateTokens(prompt);
    const co2 = estimateCO2(tokens);
    set({
      currentPrompt: prompt,
      currentCO2: co2,
    });
  },
  addCO2Saved: (amount: number) => {
    const current = get().totalCO2Saved;
    set({ totalCO2Saved: formatCO2(current + amount) });
  },
  setTotalCO2Saved: (amount: number) => {
    set({ totalCO2Saved: formatCO2(amount) });
  },
  setDraftPrompt: (prompt: string) => {
    set({ draftPrompt: prompt });
  },
  setActiveScreen: (idx: number) => {
    set({ activeScreen: idx });
  },
  updateDailyChallengeCode: (code: string) => {
    let score = 45;

    if (code.includes('Promise.all')) score += 25;
    if (code.includes('cache') || code.includes('Cache')) score += 15;
    if (code.includes('batch') || code.includes('Batch')) score += 10;
    if (!code.includes('for (') && !code.includes('forEach')) score += 5;

    score = Math.min(100, Math.max(0, score));

    set((state) => ({
      dailyChallenge: {
        ...state.dailyChallenge,
        currentCode: code,
        efficiencyScore: score,
      },
    }));
  },
}));