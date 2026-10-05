import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { estimateTokens, estimateCO2, formatCO2 } from '../_shared/co2.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { signClaimToken } from '../_shared/claims.ts';
import { MAX_PROMPT_WORDS, countWords } from '../_shared/limits.ts';
import type { OptimizeRequest, OptimizeResponse, Strategy } from '../_shared/types.ts';

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

// Common preamble applied to every strategy.
// Rules: rewrite prompts only; never answer or execute them; do not add information
// not present in the original; keep the original language; output ONLY the rewritten
// prompt with no preamble, commentary, or code fences.
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

    // Strategy validation: missing → default to 'compress'; present but invalid → 400.
    let strategy: Strategy;
    if (!body.strategy) {
      strategy = 'compress';
    } else if (!VALID_STRATEGIES.has(body.strategy as Strategy)) {
      return new Response(
        JSON.stringify({ error: `Invalid strategy '${body.strategy}'. Must be one of: compress, facts-only, bullets.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      strategy = body.strategy as Strategy;
    }

    // Log strategy name only — never the prompt text.
    console.log(`optimize: strategy=${strategy}`);

    if (!rawPrompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (countWords(rawPrompt) > MAX_PROMPT_WORDS) {
      return new Response(
        JSON.stringify({
          error: `Prompt is too long. Please keep it to ${MAX_PROMPT_WORDS} words or fewer.`,
          code: 'PROMPT_TOO_LONG',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (rawPrompt.length > MAX_PROMPT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Prompt exceeds maximum allowed length of ${MAX_PROMPT_LENGTH} characters.` }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Optional Authentication: extract user if valid JWT is provided
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

    // 4. Rate Limiting: 10 requests / minute per user ID or client IP
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
        }
      );
    }

// 5. Groq Configuration
    const apiKey = Deno.env.get('GROQ_API_KEY');
    if (!apiKey) {
      console.error('GROQ_API_KEY is missing');
      return new Response(JSON.stringify({ error: 'AI optimization service is not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const model = Deno.env.get('GROQ_MODEL') || 'openai/gpt-oss-120b';

    // 6. Call Groq API (OpenAI‑compatible)
    // Hoisted to outer scope so every use below (metrics, response) can see it.
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
          max_completion_tokens: 6000, // Updated limit for 1000-word prompts
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
            JSON.stringify({
              error: 'The AI service is busy. Please wait a minute and try again.',
              code: 'RATE_LIMITED',
            }),
            {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        if (groqResponse.status === 413) {
          return new Response(
            JSON.stringify({
              error: 'Prompt is too large for the AI service. Please shorten it.',
              code: 'PROMPT_TOO_LARGE',
            }),
            {
              status: 413,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
          );
        }

        return new Response(
          JSON.stringify({ error: 'AI optimization failed. Please try again later.' }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      const aiData = await groqResponse.json();
      const finishReason = aiData.choices?.[0]?.finish_reason;
      if (finishReason === 'length') {
        return new Response(
          JSON.stringify({
            error: 'The result was too long to generate. Please shorten your prompt.',
            code: 'RESULT_TOO_LONG',
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
      const rawContent: string = aiData.choices?.[0]?.message?.content ?? '';
      if (!rawContent.trim()) {
        // Log the full response body to aid debugging when reasoning models return empty/null content
        console.error(
          'Groq returned empty message.content. Full response:',
          JSON.stringify(aiData)
        );
        return new Response(JSON.stringify({ error: 'AI returned empty output.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      // Strip any <think>...</think> reasoning traces the model may include
      optimizedText = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (!optimizedText) {
        console.error('optimizedText was empty after stripping think tags. rawContent:', rawContent);
        return new Response(JSON.stringify({ error: 'AI returned only reasoning trace with no output.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

    // Belt-and-suspenders guard: should never reach here empty, but prevents any
    // downstream ReferenceError or stale empty-string from awarding coins.
    if (!optimizedText) {
      return new Response(JSON.stringify({ error: 'Model returned an empty response. Please retry.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 7. Calculate tokens and carbon metrics
    const originalTokens = estimateTokens(rawPrompt);
    const originalCO2 = estimateCO2(originalTokens);

    const optimizedTokens = estimateTokens(optimizedText);
    const optimizedCO2 = estimateCO2(optimizedTokens);

    // If optimized version is not shorter, no savings are awarded
    let savings = 0;
    let coinsAwarded = 0;

    if (optimizedTokens < originalTokens && originalCO2 > optimizedCO2) {
      savings = formatCO2(originalCO2 - optimizedCO2);
      // Eco-coin reward rule: 1 coin per 0.001g CO2 saved
      coinsAwarded = Math.floor(savings / 0.001);
    }

    const reductionPct =
      originalCO2 > 0 && savings > 0 ? Math.min(100, Math.round((savings / originalCO2) * 100)) : 0;

    let persisted = false;

    // 8. If authenticated user, record event & credit profile
    if (user && savings > 0) {
      try {
        const admin = getSupabaseAdmin();

        // Audit log insert (privacy-first: no prompt text)
        const { error: eventError } = await admin.from('prompt_events').insert({
          user_id: user.id,
          strategy,
          original_tokens: originalTokens,
          optimized_tokens: optimizedTokens,
          original_co2: originalCO2,
          optimized_co2: optimizedCO2,
          co2_saved: savings,
          coins_awarded: coinsAwarded,
        });

        if (eventError) {
          console.error('Failed to log prompt event:', eventError.message);
        } else {
          // Atomically award coins and CO2 saved to user's profile
          const { error: awardError } = await admin.rpc('award_progress', {
            p_user_id: user.id,
            p_co2_saved: savings,
            p_coins: coinsAwarded,
          });

          if (awardError) {
            console.error('Failed to award user progress:', awardError.message);
          } else {
            persisted = true;
          }
        }
      } catch (dbErr) {
        console.error('Database write error during award_progress:', dbErr);
      }
    }

    // 9. If unauthenticated guest with savings, generate HMAC-signed claim token
    let claimToken: string | undefined;
    if (!user && savings > 0) {
      const claimSecret = Deno.env.get('GUEST_CLAIM_SECRET');
      if (claimSecret) {
        try {
          claimToken = await signClaimToken(
            {
              claim_id: crypto.randomUUID(),
              tokens_saved: Math.max(0, originalTokens - optimizedTokens),
              co2_saved: savings,
              coins: coinsAwarded,
              timestamp: Date.now(),
            },
            claimSecret
          );
        } catch (signErr) {
          console.error('Failed to sign guest claim token:', signErr);
        }
      } else {
        console.warn('GUEST_CLAIM_SECRET is not configured; guest claim tokens disabled.');
      }
    }

    const responsePayload: OptimizeResponse = {
      strategy,
      original: {
        text: rawPrompt,
        tokens: originalTokens,
        co2: originalCO2,
      },
      optimized: {
        text: optimizedText,
        tokens: optimizedTokens,
        co2: optimizedCO2,
      },
      savings,
      reduction_pct: reductionPct,
      coins_awarded: coinsAwarded,
      persisted,
      claim_token: claimToken,
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unhandled optimize Edge Function error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error processing prompt optimization.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
