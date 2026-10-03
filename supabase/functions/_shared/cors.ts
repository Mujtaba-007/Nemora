// CORS headers and request handler for Supabase Edge Functions

/**
 * List of explicitly allowed origins.
 * Add or remove entries as needed. The first entry is used as the
 * fallback "primary" origin when the request's Origin header is not allowed.
 */
export const ALLOWED_ORIGINS = [
  'https://nemora.tech',
  'https://www.nemora.tech',
  'http://localhost:3000',
  // Vercel preview deployments – replace YOUR-PROJECT with your Vercel project name
  // Example: https://myproject-abc123.vercel.app
  // The regex below will match any preview URL of the form
  //   https://YOUR-PROJECT-<hash>.vercel.app
];

/**
 * Regular expression that matches Vercel preview deployment URLs for this project.
 * Replace `YOUR-PROJECT` with the exact prefix of your Vercel project (the part before the hyphen).
 * Example: if your preview URLs look like `https://myproject-abcd123.vercel.app`,
 * use `/^https:\/\/myproject-[a-z0-9-]+\.vercel\.app$/`.
 */
const VERCEL_PREVIEW_REGEX = /^https:\/\/nemora-[a-z0-9-]+\.vercel\.app$/;

/**
 * Determines whether the supplied origin is allowed.
 * An origin is allowed if it is in the explicit list OR it matches the Vercel preview regex.
 */
function isOriginAllowed(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return VERCEL_PREVIEW_REGEX.test(origin);
}

/**
 * Returns the appropriate CORS headers for a request.
 * The `Access-Control-Allow-Origin` header echoes the request's Origin when allowed,
 * otherwise it falls back to the first entry in `ALLOWED_ORIGINS`.
 * `Vary: Origin` is always included so caches differentiate responses.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const allowed = isOriginAllowed(origin);
  const allowOrigin = allowed ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * Handles CORS pre‑flight OPTIONS requests.
 * If the request method is OPTIONS, a short 200 response with the CORS headers is returned.
 * Otherwise `null` is returned so the caller can continue normal handling.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: getCorsHeaders(req),
    });
  }
  return null;
}
