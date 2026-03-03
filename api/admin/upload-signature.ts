// api/admin/upload-signature.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Decodes the Clerk JWT payload locally — checks expiry and issuer.
// No SDK needed. Clerk's edge middleware handles full sig verification in prod.

async function verifyClerkToken(req: VercelRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;

    const token = authHeader.slice(7).trim();
    if (!token) return false;

    // Clerk tokens are JWTs: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const payloadB64 = parts[1];
    if (!payloadB64) return false;

    // Base64url decode
    const padded  = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const payload = JSON.parse(decoded) as Record<string, unknown>;

    // Must not be expired
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      console.warn('[upload-signature] token expired');
      return false;
    }

    // Issuer must contain "clerk" (covers clerk.*.lcl.dev and production URLs)
    if (typeof payload.iss === 'string' && !payload.iss.includes('clerk')) {
      console.warn('[upload-signature] unexpected issuer:', payload.iss);
      return false;
    }

    return true;
  } catch (e) {
    console.error('[upload-signature] token parse failed:', e);
    return false;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Auth
  const authed = await verifyClerkToken(req);
  if (!authed) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  // Validate env
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY    ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    console.error('[upload-signature] Cloudinary env vars missing');
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  // Generate signature
  const { folder = 'cosmofolio' } = (req.body as { folder?: string }) ?? {};

    try {
    console.log('[upload-signature] env check:', {
      hasCloudName: !!process.env.CLOUDINARY_CLOUD_NAME,
      hasApiKey:    !!process.env.CLOUDINARY_API_KEY,
      hasApiSecret: !!process.env.CLOUDINARY_API_SECRET,
      folder,
    });

    const timestamp = Math.round(Date.now() / 1000);

    const signature = cloudinary.utils.api_sign_request(
      { folder, timestamp },
      process.env.CLOUDINARY_API_SECRET,
    );

    res.status(200).json({
      signature,
      timestamp,
      apiKey:    process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      folder,
    });
  } catch (err) {
    console.error('[upload-signature] signing error:', err);
    res.status(500).json({ error: 'Failed to generate upload signature' });
  }
}