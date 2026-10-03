export type Strategy = 'compress' | 'facts-only' | 'bullets';

export interface OptimizeRequest {
  prompt: string;
  strategy?: Strategy;
}

export interface OptimizeResponse {
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
  claim_token?: string;
}

export interface ClaimGuestProgressRequest {
  tokens: string[];
}

export interface ClaimGuestProgressResponse {
  success: boolean;
  claims_processed: number;
  coins_claimed: number;
  co2_claimed: number;
  message?: string;
}

export interface SubmitChallengeRequest {
  challenge_id: string;
  code: string;
}

export interface SubmitChallengeResponse {
  score: number;
  best_score: number;
  rank: number;
}

export interface GlobalStatsResponse {
  total_co2_saved: number;
  total_optimizations: number;
  total_users: number;
  trees_equivalent: number;
}
