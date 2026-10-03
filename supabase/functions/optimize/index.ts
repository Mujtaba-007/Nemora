import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { estimateTokens, estimateCO2, formatCO2 } from '../_shared/co2.ts';
import { getSupabaseAdmin, getSupabaseUserClient } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';
import { signClaimToken } from '../_shared/claims.ts';
import type { OptimizeRequest, OptimizeResponse, Strategy } from '../_shared/types.ts';

const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_MODEL = 'google/gemini-2.0-flash-001';

const SYSTEM_PROMPTS: Record<Strategy, string> = {
  compress:
    'You are an environmental efficiency agent. Rewrite the following prompt to be as short, dense, and token-efficient as possible while preserving all functional requirements, intent, code snippets, and numbers verbatim. Return ONLY the rewritten text without markdown code blocks, prefixes, or explanations.',
  'facts-only':
    'You are an environmental efficiency agent. Rewrite the following prompt extracting only core factual specifications and instructions, eliminating conversational filler, preserving all technical details, numbers, and code verbatim. Return ONLY the rewritten text without explanations.',
  bullets:
    'You are an environmental efficiency agent. Rewrite the following prompt into ultra-concise bullet points capturing essential requirements and code/numbers verbatim. Return ONLY the bulleted text without explanations.',
};

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
    const strategy: Strategy = body.strategy && SYSTEM_PROMPTS[body.strategy] ? body.strategy : 'compress';

    if (!rawPrompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const model = Deno.env.get('GROQ_MODEL') || 'llama-3.3-70b-versatile';

    // 6. Call Groq API (OpenAI‑compatible)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
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
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (groqResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limited by AI provider. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        console.error('Groq error:', groqResponse.status, errText);
        return new Response(JSON.stringify({ error: 'AI optimization failed. Please try again later.' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const aiData = await groqResponse.json();
      const optimizedText = (aiData.choices?.[0]?.message?.content || '').trim();
      if (!optimizedText) {
        return new Response(JSON.stringify({ error: 'AI returned empty output.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
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
