import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import type { SubmitChallengeRequest, SubmitChallengeResponse } from '../_shared/types.ts';

const MAX_CODE_LENGTH = 10000;

/**
 * Server-side heuristic scoring for code optimization challenges.
 * Pure static pattern analysis - user code is never evaluated or executed.
 */
function scoreChallengeCode(code: string): number {
  let score = 45;

  if (code.includes('Promise.all')) score += 25;
  if (code.includes('cache') || code.includes('Cache')) score += 15;
  if (code.includes('batch') || code.includes('Batch')) score += 10;
  if (!code.includes('for (') && !code.includes('forEach')) score += 5;

  return Math.min(100, Math.max(0, score));
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 1. Enforce Authentication (auth required)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required to submit challenge code.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = getSupabaseUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired authentication token.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = userData.user.id;

    // 2. Validate input
    const body: SubmitChallengeRequest = await req.json().catch(() => ({ challenge_id: '', code: '' }));
    const challengeId = (body.challenge_id || '').trim();
    const code = (body.code || '').trim();

    if (!challengeId || !code) {
      return new Response(JSON.stringify({ error: 'challenge_id and code are required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (code.length > MAX_CODE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Code exceeds maximum allowed length of ${MAX_CODE_LENGTH} characters.` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Compute score server-side
    const currentScore = scoreChallengeCode(code);
    const admin = getSupabaseAdmin();

    // Verify challenge exists
    const { data: challenge, error: challengeError } = await admin
      .from('daily_challenges')
      .select('id')
      .eq('id', challengeId)
      .single();

    if (challengeError || !challenge) {
      return new Response(JSON.stringify({ error: 'Challenge not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4. Fetch existing submission to preserve best score
    const { data: existingSub } = await admin
      .from('challenge_submissions')
      .select('score')
      .eq('user_id', userId)
      .eq('challenge_id', challengeId)
      .maybeSingle();

    let bestScore = currentScore;

    if (existingSub) {
      bestScore = Math.max(existingSub.score, currentScore);
      // Update with new best score or preserve existing higher score
      const updateData: { score: number; code?: string } = { score: bestScore };
      if (currentScore >= existingSub.score) {
        updateData.code = code;
      }
      await admin
        .from('challenge_submissions')
        .update(updateData)
        .eq('user_id', userId)
        .eq('challenge_id', challengeId);
    } else {
      await admin.from('challenge_submissions').insert({
        user_id: userId,
        challenge_id: challengeId,
        code,
        score: currentScore,
      });
    }

    // 5. Compute user's rank on this challenge
    const { count: higherCount } = await admin
      .from('challenge_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('challenge_id', challengeId)
      .gt('score', bestScore);

    const rank = (higherCount || 0) + 1;

    const payload: SubmitChallengeResponse = {
      score: currentScore,
      best_score: bestScore,
      rank,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled submit-challenge error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error evaluating challenge submission.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
