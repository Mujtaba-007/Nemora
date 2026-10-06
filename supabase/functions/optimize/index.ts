import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { estimateTokens, estimateCO2, formatCO2 } from '../_shared/co2.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { signClaimToken } from '../_shared/claims.ts';
import {
  MAX_PROMPT_CHARS,
  MAX_REWARDED_OPTIMIZATIONS_PER_DAY,
  MAX_COINS_PER_DAY,
} from '../_shared/limits.ts';
import type { OptimizeRequest, OptimizeResponse, Strategy } from '../_shared/types.ts';

// ---------------------------------------------------------------------------
// Strategy system prompts (unchanged)
// ---------------------------------------------------------------------------

const STRATEGY_PREAMBLE =
  'You rewrite prompts. You never answer or execute them. ' +
  'Do not add any information that is not in the original. ' +
  'Keep the original language. ' +
  'Output ONLY the rewritten prompt — no preamble, no commentary, no code fences.';

const SYSTEM_PROMPTS: Record<Strategy, string> = {
  compress:
    `${STRATEGY_PREAMBLE}\n\n` +
    'Strategy: COMPRESS. ' +
    'Rewrite the prompt as the shortest possible prose that preserves every instruction, constraint, and requested output format. ' +
    'Remove filler words, politeness phrases, repetition, and background narration. Do not use bullet points.',

  'facts-only':
    `${STRATEGY_PREAMBLE}\n\n` +
    'Strategy: FACTS-ONLY. ' +
    'Extract only hard facts: the task, inputs, names, numbers, code snippets, and explicit constraints. ' +
    'Drop opinions, explanations, and all conversational language. ' +
    'Output terse plain-text fragments, one per line, with no bullets and no headers.',

  bullets:
    `${STRATEGY_PREAMBLE}\n\n` +
    'Strategy: BULLETS. ' +
    'Restructure the prompt into a dense bulleted spec with short sections labelled Goal, Context, Requirements, Constraints, Output Format. ' +
    'Every line must start with "- " and be a short fragment, not a full sentence.',
};

const VALID_STRATEGIES = new Set<Strategy>(['compress', 'facts-only', 'bullets']);

// ---------------------------------------------------------------------------
// HMAC-SHA256 helper – produces a lowercase hex digest
// ---------------------------------------------------------------------------
async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // 1. Handle CORS preflight
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
    // 2. Parse & validate request body
    const body: OptimizeRequest = await req.json().catch(() => ({ prompt: '' }));
    const rawPrompt = (body.prompt || '').trim();

    // Strategy validation
    let strategy: Strategy;
    if (!body.strategy) {
      strategy = 'compress';
    } else if (!VALID_STRATEGIES.has(body.strategy as Strategy)) {
      return new Response(
        JSON.stringify({ error: `Invalid strategy '${body.strategy}'. Must be one of: compress, facts-only, bullets.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    } else {
      strategy = body.strategy as Strategy;
    }

    console.log(`optimize: strategy=${strategy}`);

    if (!rawPrompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Character limit check (must happen before any AI call or rate-limit)
    if (rawPrompt.length > MAX_PROMPT_CHARS) {
      return new Response(
        JSON.stringify({
          error: 'Prompt is too long. Please keep it to 4,000 characters or fewer.',
          code: 'PROMPT_TOO_LONG',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. Read secrets INSIDE the handler (never at module level)
    const promptHashSecret = Deno.env.get('PROMPT_HASH_SECRET');
    if (!promptHashSecret) {
      console.error('PROMPT_HASH_SECRET is not configured');
      return new Response(
        JSON.stringify({ error: 'Reward service is not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 5. Optional auth: extract user if a valid JWT was sent
    const authHeader = req.headers.get('Authorization');
    let user: { id: string } | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const userClient = getSupabaseUserClient(authHeader);
        const { data: userData, error: userError } = await userClient.auth.getUser();
        if (!userError && userData?.user) {
          user = { id: userData.user.id };
        }
      } catch (authErr) {
        console.warn('Optional auth check failed:', authErr);
      }
    }

    // 6. Per-minute rate limit (10 req/min per user or IP)
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'anonymous';
    const rateLimitKey = user ? `usr:${user.id}` : `ip:${clientIp}`;

    const limitResult = await checkRateLimit(rateLimitKey, 10);
    if (!limitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: `Rate limit exceeded. Please wait ${limitResult.retryAfterSeconds} seconds before optimizing again.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(limitResult.retryAfterSeconds),
          },
        },
      );
    }

    // 7. Groq API key
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
      console.error('GROQ_API_KEY is missing');
      return new Response(JSON.stringify({ error: 'AI optimization service is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';

    // 8. Call Groq
    let optimizedText = '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    try {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPTS[strategy] },
            { role: 'user', content: rawPrompt },
          ],
          temperature: 0.2,
          max_completion_tokens: 3000,
          reasoning_effort: 'low',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        console.error('Groq upstream error:', groqResponse.status, errText);

        if (groqResponse.status === 429) {
          return new Response(
            JSON.stringify({ error: 'The AI service is busy. Please wait a minute and try again.', code: 'RATE_LIMITED' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        if (groqResponse.status === 413) {
          return new Response(
            JSON.stringify({ error: 'Prompt is too large for the AI service. Please shorten it.', code: 'PROMPT_TOO_LARGE' }),
            { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({ error: 'AI optimization failed. Please try again later.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const aiData = await groqResponse.json();
      const finishReason = aiData.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        return new Response(
          JSON.stringify({ error: 'The result was too long to generate. Please shorten your prompt.', code: 'RESULT_TOO_LONG' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const rawContent: string = aiData.choices?.[0]?.message?.content ?? '';
      if (!rawContent.trim()) {
        console.error('Groq returned empty message.content. Full response:', JSON.stringify(aiData));
        return new Response(JSON.stringify({ error: 'AI returned empty output.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Strip any <think>...</think> reasoning traces
      optimizedText = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!optimizedText) {
        console.error('optimizedText was empty after stripping think tags. rawContent:', rawContent);
        return new Response(
          JSON.stringify({ error: 'AI returned only reasoning trace with no output.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } catch (e) {
      clearTimeout(timeout);
      if (e.name === 'AbortError') {
        console.error('Groq request timed out');
        return new Response(JSON.stringify({ error: 'AI request timed out.' }), {
          status: 504,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      console.error('Unexpected error calling Groq:', e);
      return new Response(JSON.stringify({ error: 'Internal server error during AI call.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!optimizedText) {
      return new Response(JSON.stringify({ error: 'Model returned an empty response. Please retry.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 9. Calculate metrics
    const originalTokens = estimateTokens(rawPrompt);
    const originalCO2 = estimateCO2(originalTokens);
    const optimizedTokens = estimateTokens(optimizedText);
    const optimizedCO2 = estimateCO2(optimizedTokens);

    let savings = 0;
    let coinsAwarded = 0;
    if (optimizedTokens < originalTokens && originalCO2 > optimizedCO2) {
      savings = formatCO2(originalCO2 - optimizedCO2);
      coinsAwarded = Math.floor(savings / 0.001);
    }

    const reductionPct =
      originalCO2 > 0 && savings > 0
        ? Math.min(100, Math.round((savings / originalCO2) * 100))
        : 0;

    // 10. Compute HMAC of normalised prompt (strategy NOT included → switching
    //     strategy on the same prompt cannot earn a second reward today)
    const normalizedPrompt = rawPrompt.toLowerCase().replace(/\s+/g, ' ');
    const promptHash = await hmacSha256Hex(normalizedPrompt, promptHashSecret);

    let persisted = false;
    let awarded = false;
    let awardReason: string | null = null;

    // 11. Authenticated user flow
    if (user) {
      if (savings > 0) {
        try {
          const admin = getSupabaseAdmin();
          const { data: rpcData, error: rpcError } = await admin.rpc('award_progress_with_hash', {
            p_user_id:          user.id,
            p_prompt_hash:      promptHash,
            p_strategy:         strategy,
            p_original_tokens:  originalTokens,
            p_optimized_tokens: optimizedTokens,
            p_original_co2:     originalCO2,
            p_optimized_co2:    optimizedCO2,
            p_co2_saved:        savings,
            p_coins:            coinsAwarded,
            p_max_events:       MAX_REWARDED_OPTIMIZATIONS_PER_DAY,
            p_max_coins:        MAX_COINS_PER_DAY,
          });

          if (rpcError) {
            // Fail closed: log the error, return optimised text, zero coins
            console.error('award_progress_with_hash RPC error:', rpcError);
            awardReason = 'REWARD_ERROR';
          } else {
            // supabase-js returns an array for table-returning RPCs
            const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
            awarded = row?.awarded === true;
            awardReason = row?.reason ?? null;
            if (awarded) {
              persisted = true;
              await admin.rpc('refresh_profile_noop').catch(() => {}); // best-effort
            }
          }
        } catch (dbErr) {
          console.error('DB error during award_progress_with_hash:', dbErr);
          awardReason = 'REWARD_ERROR';
        }
      } else {
        // savings === 0 → NO_SAVINGS
        awardReason = 'NO_SAVINGS';
      }
    }

    // 12. Guest flow – do NOT call the RPC; sign a claim token if there are savings
    let claimToken: string | undefined;
    if (!user) {
      if (savings > 0) {
        awarded = true; // indicate to frontend that coins would have been earned
        const claimSecret = Deno.env.get('GUEST_CLAIM_SECRET');
        if (claimSecret) {
          try {
            claimToken = await signClaimToken(
              {
                claim_id:     crypto.randomUUID(),
                tokens_saved: Math.max(0, originalTokens - optimizedTokens),
                co2_saved:    savings,
                coins:        coinsAwarded,
                timestamp:    Date.now(),
                prompt_hash:  promptHash,
              },
              claimSecret,
            );
          } catch (signErr) {
            console.error('Failed to sign guest claim token:', signErr);
          }
        } else {
          console.warn('GUEST_CLAIM_SECRET not configured; guest claim tokens disabled.');
        }
      } else {
        awardReason = 'NO_SAVINGS';
      }
    }

    // 13. Build response – zero coins & persisted=false whenever not awarded
    const responsePayload: OptimizeResponse = {
      strategy,
      original:  { text: rawPrompt,      tokens: originalTokens,  co2: originalCO2 },
      optimized: { text: optimizedText,  tokens: optimizedTokens, co2: optimizedCO2 },
      savings,
      reduction_pct: reductionPct,
      coins_awarded: awarded ? coinsAwarded : 0,
      persisted,
      awarded,
      reason: awardReason,
      claim_token: claimToken,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled optimize Edge Function error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error processing prompt optimization.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
