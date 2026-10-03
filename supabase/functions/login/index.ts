import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { checkRateLimit } from '../_shared/rateLimiter.ts';

const GENERIC_ERROR_MESSAGE = 'Credentials not recognized';

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
    const body = await req.json().catch(() => ({}));
    const rawIdentifier = (body.identifier || '').trim();
    const rawPassword = body.password || '';

    // 2. Validate presence of credentials (fail generic)
    if (!rawIdentifier || !rawPassword) {
      return new Response(JSON.stringify({ error: GENERIC_ERROR_MESSAGE }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const identifier = rawIdentifier.toLowerCase();
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'anonymous';

    // 3. Strict Rate Limiting: 5 attempts / minute per IP and per identifier
    const ipLimit = await checkRateLimit(`login:ip:${clientIp}`, 5);
    const identifierLimit = await checkRateLimit(`login:id:${identifier}`, 5);

    if (!ipLimit.allowed || !identifierLimit.allowed) {
      const retryAfter = Math.max(ipLimit.retryAfterSeconds, identifierLimit.retryAfterSeconds);
      return new Response(
        JSON.stringify({
          error: `Too many login attempts. Please wait ${retryAfter} seconds before trying again.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(retryAfter),
          },
        }
      );
    }

    const admin = getSupabaseAdmin();
    let emailToAuth = identifier;

    // 4. Resolve username to email if no '@' provided
    if (!identifier.includes('@')) {
      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('id')
        .eq('username', identifier)
        .maybeSingle();

      if (profileErr || !profile) {
        console.warn(`[Login] Username not found in profiles: ${identifier}`);
        return new Response(JSON.stringify({ error: GENERIC_ERROR_MESSAGE }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: userData, error: userErr } = await admin.auth.admin.getUserById(profile.id);
      if (userErr || !userData?.user?.email) {
        console.warn(`[Login] Could not resolve email for profile id ${profile.id}:`, userErr?.message);
        return new Response(JSON.stringify({ error: GENERIC_ERROR_MESSAGE }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      emailToAuth = userData.user.email;
    }

    // 5. Authenticate via Supabase Auth
    const { data: authData, error: authError } = await admin.auth.signInWithPassword({
      email: emailToAuth,
      password: rawPassword,
    });

    if (authError || !authData?.session) {
      console.warn(`[Login] Authentication failed for ${emailToAuth}:`, authError?.message);
      return new Response(JSON.stringify({ error: GENERIC_ERROR_MESSAGE }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 6. Return session tokens to client
    return new Response(
      JSON.stringify({
        session: {
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
          expires_in: authData.session.expires_in,
          expires_at: authData.session.expires_at,
          token_type: authData.session.token_type,
        },
        user: {
          id: authData.user.id,
          email: authData.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('[Login] Unhandled exception:', err);
    return new Response(JSON.stringify({ error: GENERIC_ERROR_MESSAGE }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
