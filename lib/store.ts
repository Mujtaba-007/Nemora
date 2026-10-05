import { create } from 'zustand';
import {
  estimateTokens,
  estimateCO2,
  formatCO2,
  CO2_RATING_THRESHOLDS,
  getCO2Rating,
} from './co2';
import { getGardenDaily, type GardenDailyRecord } from './api';

// Re-export for any legacy imports
export { estimateTokens, estimateCO2, formatCO2, CO2_RATING_THRESHOLDS, getCO2Rating };
export const calculateCO2 = estimateCO2;

interface CO2State {
  currentPrompt: string;
  currentCO2: number;
  totalCO2Saved: number;
  co2History: { date: string; saved: number }[];
  gardenStats: { treeId: number; co2Saved: number; plantedDate: string }[];
  gardenRecords: GardenDailyRecord[];
  loadingGarden: boolean;
  gardenError: boolean;
  sessionTrees: number;
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
  refreshGardenData: (isAuthed: boolean) => Promise<void>;
  resetGardenData: () => void;
}

let inFlightGardenPromise: Promise<GardenDailyRecord[]> | null = null;

export const useCO2Store = create<CO2State>((set, get) => ({
  currentPrompt: '',
  currentCO2: 0,
  totalCO2Saved: 0,
  co2History: [],
  gardenStats: [],
  gardenRecords: [],
  loadingGarden: false,
  gardenError: false,
  sessionTrees: 0,
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
    set({
      totalCO2Saved: formatCO2(current + amount),
      sessionTrees: amount > 0 ? get().sessionTrees + 1 : get().sessionTrees,
    });
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
  refreshGardenData: async (isAuthed: boolean) => {
    if (!isAuthed) {
      set({ gardenRecords: [], loadingGarden: false, gardenError: false });
      return;
    }
    if (inFlightGardenPromise) {
      await inFlightGardenPromise;
      return;
    }
    set({ loadingGarden: true, gardenError: false });
    inFlightGardenPromise = getGardenDaily()
      .then((records) => {
        set({ gardenRecords: records, loadingGarden: false, gardenError: false });
        return records;
      })
      .catch((err) => {
        console.warn('Failed to fetch garden daily records:', err);
        set({ gardenError: true, loadingGarden: false });
        return [];
      })
      .finally(() => {
        inFlightGardenPromise = null;
      });
    await inFlightGardenPromise;
  },
  resetGardenData: () => {
    set({
      gardenRecords: [],
      sessionTrees: 0,
      totalCO2Saved: 0,
      loadingGarden: false,
      gardenError: false,
    });
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