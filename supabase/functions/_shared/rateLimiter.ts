import { getSupabaseAdmin } from './supabaseAdmin.ts';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  currentCount: number;
}

/**
 * Atomic 1-minute window rate limiter using Postgres `rate_limits` table.
 * 
 * @param key Unique identifier (user UUID or client IP)
 * @param maxRequests Maximum requests allowed per 1-minute window (default: 10)
 */
export async function checkRateLimit(key: string, maxRequests = 10): Promise<RateLimitResult> {
  const admin = getSupabaseAdmin();
  const now = new Date();
  
  // Truncate to the current 60-second window
  const windowStart = new Date(Math.floor(now.getTime() / 60000) * 60000).toISOString();
  const secondsRemainingInWindow = 60 - Math.floor((now.getTime() % 60000) / 1000);

  try {
    // Call stored procedure or direct upsert
    const { data, error } = await admin.rpc('increment_rate_limit', {
      p_key: key,
      p_window_start: windowStart,
    });

    if (error) {
      console.error('Rate limit RPC error:', error.message);
      // Fallback: allow request in case of transient DB error
      return { allowed: true, retryAfterSeconds: 0, currentCount: 1 };
    }

    const currentCount = Number(data);
    const allowed = currentCount <= maxRequests;

    return {
      allowed,
      retryAfterSeconds: allowed ? 0 : Math.max(1, secondsRemainingInWindow),
      currentCount,
    };
  } catch (err) {
    console.error('Rate limiter exception:', err);
    return { allowed: true, retryAfterSeconds: 0, currentCount: 1 };
  }
}
