import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { getCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts';
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts';
import type { GlobalStatsResponse } from '../_shared/types.ts';

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(req);

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('global_stats')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Error fetching global_stats view:', error.message);
    }

    const payload: GlobalStatsResponse = {
      total_co2_saved: Number(data?.total_co2_saved || 0),
      total_optimizations: Number(data?.total_optimizations || 0),
      total_users: Number(data?.total_users || 0),
      trees_equivalent: Number(data?.trees_equivalent || 0),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=30',
      },
    });
  } catch (err) {
    console.error('Unhandled stats Edge Function error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error reading statistics.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
