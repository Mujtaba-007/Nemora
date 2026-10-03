export interface GuestClaimPayload {
  claim_id: string;
  tokens_saved: number;
  co2_saved: number;
  coins: number;
  timestamp: number;
}

function base64UrlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return atob(base64);
}

/**
 * Creates an HMAC-SHA256 signed claim token for guest optimizations.
 */
export async function signClaimToken(payload: GuestClaimPayload, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const signatureBytes = new Uint8Array(signatureBuffer);
  let binaryStr = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    binaryStr += String.fromCharCode(signatureBytes[i]);
  }
  const signatureB64 = base64UrlEncode(binaryStr);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies an HMAC-SHA256 signed claim token and extracts the payload.
 * Returns null if the signature is invalid or payload is malformed.
 */
export async function verifyClaimToken(token: string, secret: string): Promise<GuestClaimPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64, signatureB64] = parts;
  if (!payloadB64 || !signatureB64) {
    return null;
  }

  const encoder = new TextEncoder();

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const rawSig = base64UrlDecode(signatureB64);
    const sigBytes = new Uint8Array(rawSig.length);
    for (let i = 0; i < rawSig.length; i++) {
      sigBytes[i] = rawSig.charCodeAt(i);
    }

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(payloadB64)
    );

    if (!isValid) {
      return null;
    }

    const payloadJson = base64UrlDecode(payloadB64);
    const parsed = JSON.parse(payloadJson) as GuestClaimPayload;

    if (
      !parsed.claim_id ||
      typeof parsed.tokens_saved !== 'number' ||
      typeof parsed.co2_saved !== 'number' ||
      typeof parsed.coins !== 'number' ||
      typeof parsed.timestamp !== 'number'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}
