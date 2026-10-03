import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import { verifyClaimToken, type GuestClaimPayload } from '../_shared/claims.ts';
import type { ClaimGuestProgressRequest, ClaimGuestProgressResponse } from '../_shared/types.ts';

// Limits to prevent economy inflation
const MAX_GUEST_CLAIMS_PER_USER = 10;
const MAX_GUEST_COINS_PER_USER = 500;
const MAX_TOKEN_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const userClient = getSupabaseUserClient(authHeader);
    const { data: userData, error: userError } = await userClient.auth.getUser();

    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session. Please log in again.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
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
      console.error('GUEST_CLAIM_SECRET is not configured in Supabase environment');
      return new Response(
        JSON.stringify({ error: 'Claim service is temporarily unavailable.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const admin = getSupabaseAdmin();

    // 4. Check existing claims by this user to enforce per-account caps
    const { data: existingUserClaims, error: claimsErr } = await admin
      .from('guest_claims')
      .select('coins')
      .eq('user_id', userId);

    if (claimsErr) {
      console.error('Failed to query existing guest claims:', claimsErr.message);
      return new Response(
        JSON.stringify({ error: 'Database error reading account claims.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    let userClaimCount = existingUserClaims?.length || 0;
    let userClaimedCoins = (existingUserClaims || []).reduce((sum, c) => sum + (c.coins || 0), 0);

    if (userClaimCount >= MAX_GUEST_CLAIMS_PER_USER || userClaimedCoins >= MAX_GUEST_COINS_PER_USER) {
      return new Response(
        JSON.stringify({
          error: `Account has reached the maximum allowed guest claim limit (${MAX_GUEST_CLAIMS_PER_USER} claims / ${MAX_GUEST_COINS_PER_USER} coins).`,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 5. Verify tokens, deduplicate, and enforce caps
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

      // Check expiry (7 days) & clock skew (within 1 min into future)
      if (now - payload.timestamp > MAX_TOKEN_AGE_MS || payload.timestamp > now + 60000) {
        console.warn('Rejected token: expired or invalid timestamp');
        continue;
      }

      // Validate amounts
      if (payload.coins <= 0 || payload.co2_saved <= 0 || payload.tokens_saved < 0) {
        console.warn('Rejected token: invalid non-positive amounts');
        continue;
      }

      // Prevent duplicate in same batch
      if (seenClaimIds.has(payload.claim_id)) {
        continue;
      }
      seenClaimIds.add(payload.claim_id);

      // Check if claim_id was already claimed in database
      const { data: dbClaim } = await admin
        .from('guest_claims')
        .select('claim_id')
        .eq('claim_id', payload.claim_id)
        .maybeSingle();

      if (dbClaim) {
        console.warn(`Rejected duplicate claim_id: ${payload.claim_id}`);
        continue;
      }

      // Check user caps
      if (
        userClaimCount + 1 > MAX_GUEST_CLAIMS_PER_USER ||
        userClaimedCoins + payload.coins > MAX_GUEST_COINS_PER_USER
      ) {
        console.warn('Account cap reached during batch processing, stopping further additions.');
        break;
      }

      userClaimCount++;
      userClaimedCoins += payload.coins;
      validClaims.push(payload);
    }

    if (validClaims.length === 0) {
      const response: ClaimGuestProgressResponse = {
        success: true,
        claims_processed: 0,
        coins_claimed: 0,
        co2_claimed: 0,
        message: 'No valid or unclaimed guest tokens found.',
      };
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Record claims in database
    const claimRows = validClaims.map((c) => ({
      claim_id: c.claim_id,
      user_id: userId,
      tokens_saved: c.tokens_saved,
      co2_saved: c.co2_saved,
      coins: c.coins,
    }));

    const { error: insertClaimError } = await admin.from('guest_claims').insert(claimRows);
    if (insertClaimError) {
      console.error('Failed to insert guest_claims:', insertClaimError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to record guest claims.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 7. Log prompt_events so trees and gardens reflect the claimed guest optimizations
    const promptEventRows = validClaims.map((c) => ({
      user_id: userId,
      strategy: 'compress' as const,
      original_tokens: c.tokens_saved,
      optimized_tokens: 0,
      original_co2: c.co2_saved,
      optimized_co2: 0,
      co2_saved: c.co2_saved,
      coins_awarded: c.coins,
    }));

    await admin.from('prompt_events').insert(promptEventRows);

    // 8. Atomically award coins and CO2 progress to profile
    const totalCO2ToAward = Number(validClaims.reduce((sum, c) => sum + c.co2_saved, 0).toFixed(3));
    const totalCoinsToAward = validClaims.reduce((sum, c) => sum + c.coins, 0);

    const { error: awardError } = await admin.rpc('award_progress', {
      p_user_id: userId,
      p_co2_saved: totalCO2ToAward,
      p_coins: totalCoinsToAward,
    });

    if (awardError) {
      console.error('Failed to award progress after recording guest claims:', awardError.message);
      return new Response(
        JSON.stringify({ error: 'Claims recorded, but failed to credit profile balance.' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const response: ClaimGuestProgressResponse = {
      success: true,
      claims_processed: validClaims.length,
      coins_claimed: totalCoinsToAward,
      co2_claimed: totalCO2ToAward,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled claim-guest-progress error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing guest claims.' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
