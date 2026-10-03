import { supabase } from './supabase';
import type { CO2Rating } from './co2';

export interface OptimizeParams {
  prompt: string;
  strategy?: 'compress' | 'facts-only' | 'bullets';
}

export interface OptimizeResult {
  original: {
    text: string;
    tokens: number;
    co2: number;
  };
  optimized: {
    text: string;
    tokens: number;
    co2: number;
  };
  savings: number;
  reduction_pct: number;
  coins_awarded: number;
  persisted: boolean;
}

export interface SubmitChallengeParams {
  challengeId: string;
  code: string;
}

export interface SubmitChallengeResult {
  score: number;
  best_score: number;
  rank: number;
}

export interface GlobalStats {
  total_co2_saved: number;
  total_optimizations: number;
  total_users: number;
  trees_equivalent: number;
}

export interface LeaderboardEntry {
  rank?: number;
  username: string;
  coins: number;
  total_co2_saved: number;
  prompts_optimized: number;
  efficiency: number;
}

export interface DailyChallengeData {
  id: string;
  challenge_date: string;
  title: string;
  description: string;
  starter_code: string;
  max_score: number;
}

export class ApiError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status = 500, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Optimizes an AI prompt by calling the Supabase 'optimize' Edge Function.
 */
export async function optimizePrompt(params: OptimizeParams): Promise<OptimizeResult> {
  const { data, error } = await supabase.functions.invoke<OptimizeResult>('optimize', {
    body: {
      prompt: params.prompt,
      strategy: params.strategy || 'compress',
    },
  });

  if (error) {
    // Check if error response context has status 429
    let status = 500;
    let message = error.message || 'Failed to optimize prompt.';
    let retryAfter: number | undefined;

    if (error.context && typeof error.context === 'object') {
      const resp = error.context as Response;
      if (resp.status) status = resp.status;
      const retryHeader = resp.headers?.get?.('Retry-After');
      if (retryHeader) {
        retryAfter = parseInt(retryHeader, 10);
      }
    }

    if (status === 429 || message.toLowerCase().includes('rate limit')) {
      throw new ApiError(
        message || 'Rate limit reached (10 optimizations / minute). Please slow down and try again shortly.',
        429,
        retryAfter || 60
      );
    }

    throw new ApiError(message, status);
  }

  if (!data) {
    throw new ApiError('No response data received from optimizer.', 500);
  }

  return data;
}

/**
 * Submits optimized code for a daily challenge. Requires user authentication.
 */
export async function submitChallenge(params: SubmitChallengeParams): Promise<SubmitChallengeResult> {
  const { data, error } = await supabase.functions.invoke<SubmitChallengeResult>('submit-challenge', {
    body: {
      challenge_id: params.challengeId,
      code: params.code,
    },
  });

  if (error) {
    let status = 500;
    if (error.context && typeof error.context === 'object') {
      const resp = error.context as Response;
      if (resp.status) status = resp.status;
    }

    if (status === 401) {
      throw new ApiError('Please log in to submit your challenge and save your score.', 401);
    }

    throw new ApiError(error.message || 'Failed to submit challenge.', status);
  }

  if (!data) {
    throw new ApiError('No response from challenge evaluation.', 500);
  }

  return data;
}

/**
 * Fetches platform-wide carbon reduction metrics.
 */
export async function getGlobalStats(): Promise<GlobalStats> {
  const { data, error } = await supabase.functions.invoke<GlobalStats>('stats', {
    method: 'GET',
  });

  if (error || !data) {
    // Graceful fallback to direct DB view if edge function is unreachable
    const { data: dbData } = await supabase.from('global_stats').select('*').maybeSingle();
    if (dbData) {
      return {
        total_co2_saved: Number(dbData.total_co2_saved || 0),
        total_optimizations: Number(dbData.total_optimizations || 0),
        total_users: Number(dbData.total_users || 0),
        trees_equivalent: Number(dbData.trees_equivalent || 0),
      };
    }

    return {
      total_co2_saved: 0,
      total_optimizations: 0,
      total_users: 0,
      trees_equivalent: 0,
    };
  }

  return data;
}

/**
 * Fetches the global leaderboard ranked by efficiency.
 */
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard')
    .select('username, coins, total_co2_saved, prompts_optimized, efficiency')
    .limit(100);

  if (error || !data) {
    return [];
  }

  return data.map((item, index) => ({
    rank: index + 1,
    username: item.username,
    coins: item.coins,
    total_co2_saved: Number(item.total_co2_saved),
    prompts_optimized: item.prompts_optimized,
    efficiency: Number(item.efficiency),
  }));
}

/**
 * Fetches today's active coding challenge.
 */
export async function getDailyChallenge(): Promise<DailyChallengeData | null> {
  const today = new Date().toISOString().slice(0, 10);
  // Try to fetch a challenge for today
  const { data: todayData, error: todayError } = await supabase
    .from('daily_challenges')
    .select('*')
    .eq('challenge_date', today)
    .maybeSingle();

  if (!todayError && todayData) {
    return todayData;
  }

  // Fallback: fetch the most recent challenge
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('*')
    .order('challenge_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data;
}

export interface GardenDailyRecord {
  user_id: string;
  day: string;
  co2_saved: number;
  optimizations_count: number;
}

/**
 * Fetches 30-day daily aggregated garden data for the currently authenticated user.
 */
export async function getGardenDaily(): Promise<GardenDailyRecord[]> {
  const { data, error } = await supabase
    .from('garden_daily')
    .select('user_id, day, co2_saved, optimizations_count')
    .order('day', { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((item) => ({
    user_id: item.user_id,
    day: item.day,
    co2_saved: Number(item.co2_saved || 0),
    optimizations_count: Number(item.optimizations_count || 0),
  }));
}
