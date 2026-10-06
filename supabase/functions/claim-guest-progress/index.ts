import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import { verifyClaimToken, type GuestClaimPayload } from '../_shared/claims.ts';
import { estimateTokens, estimateCO2, formatCO2 } from '../_shared/co2.ts';
import {
  MAX_REWARDED_OPTIMIZATIONS_PER_DAY,
  MAX_COINS_PER_DAY,
} from '../_shared/limits.ts';
import type { ClaimGuestProgressRequest, ClaimGuestProgressResponse } from '../_shared/types.ts';

// Per-account caps that prevent economy inflation via guest claim abuse
const MAX_GUEST_CLAIMS_PER_USER = 10;
const MAX_GUEST_COINS_PER_USER  = 500;
const MAX_TOKEN_AGE_MS          = 7 * 24 * 60 * 60 * 1000; // 7 days

serve(async (req: Request) => {
  // 1. CORS Preflight
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
    // 2. Authenticate the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required to claim guest progress.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userClient = getSupabaseUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please log in again.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userId = userData.user.id;

    // 3. Parse request payload
    const body: ClaimGuestProgressRequest = await req.json().catch(() => ({ tokens: [] }));
    const rawTokens = Array.isArray(body.tokens) ? body.tokens : [];

    if (rawTokens.length === 0) {
      const emptyResponse: ClaimGuestProgressResponse = {
        success: true,
        claims_processed: 0,
        coins_claimed: 0,
        co2_claimed: 0,
        message: 'No tokens provided.',
      };
      return new Response(JSON.stringify(emptyResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const secret = Deno.env.get('GUEST_CLAIM_SECRET');
    if (!secret) {
      console.error('GUEST_CLAIM_SECRET is not configured');
      return new Response(
        JSON.stringify({ error: 'Claim service is temporarily unavailable.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const admin = getSupabaseAdmin();

    // 4. Check existing per-account guest-claim caps
    const { data: existingUserClaims, error: claimsErr } = await admin
      .from('guest_claims')
      .select('coins')
      .eq('user_id', userId);

    if (claimsErr) {
      console.error('Failed to query existing guest claims:', claimsErr.message);
      return new Response(
        JSON.stringify({ error: 'Database error reading account claims.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let userClaimCount  = existingUserClaims?.length || 0;
    let userClaimedCoins = (existingUserClaims || []).reduce((sum, c) => sum + (c.coins || 0), 0);

    if (userClaimCount >= MAX_GUEST_CLAIMS_PER_USER || userClaimedCoins >= MAX_GUEST_COINS_PER_USER) {
      return new Response(
        JSON.stringify({
          error: `Account has reached the maximum guest claim limit (${MAX_GUEST_CLAIMS_PER_USER} claims / ${MAX_GUEST_COINS_PER_USER} coins).`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Verify tokens, deduplicate within the batch, and enforce account caps
    const seenClaimIds = new Set<string>();
    const validClaims: GuestClaimPayload[] = [];
    const now = Date.now();

    for (const token of rawTokens) {
      if (typeof token !== 'string' || !token.includes('.')) continue;

      const payload = await verifyClaimToken(token, secret);
      if (!payload) {
        console.warn('Rejected token: invalid signature or format');
        continue;
      }

      // Expiry & clock-skew guard
      if (now - payload.timestamp > MAX_TOKEN_AGE_MS || payload.timestamp > now + 60000) {
        console.warn('Rejected token: expired or invalid timestamp');
        continue;
      }

      // Must have positive amounts
      if (payload.coins <= 0 || payload.co2_saved <= 0 || payload.tokens_saved < 0) {
        console.warn('Rejected token: invalid non-positive amounts');
        continue;
      }

      // Deduplicate within this request
      if (seenClaimIds.has(payload.claim_id)) continue;
      seenClaimIds.add(payload.claim_id);

      // Reject already-consumed claim IDs from the database
      const { data: dbClaim } = await admin
        .from('guest_claims')
        .select('claim_id')
        .eq('claim_id', payload.claim_id)
        .maybeSingle();

      if (dbClaim) {
        console.warn(`Rejected duplicate claim_id: ${payload.claim_id}`);
        continue;
      }

      // Per-account cap check
      if (
        userClaimCount + 1 > MAX_GUEST_CLAIMS_PER_USER ||
        userClaimedCoins + payload.coins > MAX_GUEST_COINS_PER_USER
      ) {
        console.warn('Account cap reached during batch, stopping further additions.');
        break;
      }

      userClaimCount++;
      userClaimedCoins += payload.coins;
      validClaims.push(payload);
    }

    if (validClaims.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          claims_processed: 0,
          coins_claimed: 0,
          co2_claimed: 0,
          message: 'No valid or unclaimed guest tokens found.',
        } as ClaimGuestProgressResponse),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 6. For each valid claim, call award_progress_with_hash via service-role client.
    //    We always record the claim_id as consumed first (via guest_claims insert)
    //    so that even a rejected duplicate cannot be retried.
    let totalCoinsClaimed = 0;
    let totalCO2Claimed   = 0;
    let claimsProcessed   = 0;

    for (const claim of validClaims) {
      // Mark as consumed regardless of award outcome (prevents retry loops)
      const { error: claimInsertErr } = await admin.from('guest_claims').insert({
        claim_id:     claim.claim_id,
        user_id:      userId,
        tokens_saved: claim.tokens_saved,
        co2_saved:    claim.co2_saved,
        coins:        claim.coins,
      });

      if (claimInsertErr) {
        // Conflict means it was claimed in a concurrent request – skip
        console.warn('guest_claims insert conflict (duplicate):', claimInsertErr.message);
        continue;
      }

      // Derive original_co2 / optimized_co2 from saved token counts
      const originalCO2  = estimateCO2(claim.tokens_saved);
      const optimizedCO2 = Math.max(0, originalCO2 - claim.co2_saved);

      // Use a fallback hash if not present in old tokens (legacy tokens won't have it)
      const promptHash = claim.prompt_hash ?? claim.claim_id;

      const { data: rpcData, error: rpcError } = await admin.rpc('award_progress_with_hash', {
        p_user_id:          userId,
        p_prompt_hash:      promptHash,
        p_strategy:         'compress', // guest sessions don't record strategy
        p_original_tokens:  claim.tokens_saved,
        p_optimized_tokens: 0,
        p_original_co2:     originalCO2,
        p_optimized_co2:    optimizedCO2,
        p_co2_saved:        claim.co2_saved,
        p_coins:            claim.coins,
        p_max_events:       MAX_REWARDED_OPTIMIZATIONS_PER_DAY,
        p_max_coins:        MAX_COINS_PER_DAY,
      });

      if (rpcError) {
        console.error('award_progress_with_hash error during claim:', rpcError.message);
        // Claim is consumed, but coins not awarded – log and continue
        continue;
      }

      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (row?.awarded) {
        totalCoinsClaimed += claim.coins;
        totalCO2Claimed   += claim.co2_saved;
        claimsProcessed++;
      } else {
        console.log(`Claim ${claim.claim_id} consumed but not awarded: ${row?.reason}`);
      }
    }

    const response: ClaimGuestProgressResponse = {
      success:          true,
      claims_processed: claimsProcessed,
      coins_claimed:    totalCoinsClaimed,
      co2_claimed:      Number(totalCO2Claimed.toFixed(3)),
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled claim-guest-progress error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing guest claims.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
