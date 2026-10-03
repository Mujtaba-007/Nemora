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

const mockGardenStats = [
  { treeId: 1, co2Saved: 15.2, plantedDate: '2024-01-15' },
  { treeId: 2, co2Saved: 8.7, plantedDate: '2024-01-20' },
  { treeId: 3, co2Saved: 22.4, plantedDate: '2024-02-01' },
  { treeId: 4, co2Saved: 12.1, plantedDate: '2024-02-10' },
  { treeId: 5, co2Saved: 18.9, plantedDate: '2024-02-15' },
  { treeId: 6, co2Saved: 5.3, plantedDate: '2024-02-20' },
];

const mockLeaderboard: any[] = [];

const mockCO2History = [
  { date: 'Mon', saved: 12.4 },
  { date: 'Tue', saved: 18.2 },
  { date: 'Wed', saved: 8.7 },
  { date: 'Thu', saved: 24.1 },
  { date: 'Fri', saved: 15.9 },
  { date: 'Sat', saved: 21.3 },
  { date: 'Sun', saved: 19.8 },
];

export const useCO2Store = create<CO2State>((set, get) => ({
  currentPrompt: '',
  currentCO2: 0,
  totalCO2Saved: 0,
  co2History: mockCO2History,
  gardenStats: mockGardenStats,
  leaderboard: mockLeaderboard,
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