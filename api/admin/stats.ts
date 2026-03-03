import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

const AUTHORIZED_PARTIES = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
];
import { query } from '../../src/lib/db';

async function verifyClerkToken(req: VercelRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const result = await query('SELECT key, value FROM site_settings');
      const settings = result.rows.reduce<Record<string, unknown>>((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      res.status(200).json(settings);
    } catch (err) {
      console.error('site_settings GET error:', err);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { key, value } = req.body as { key?: string; value?: unknown };

    if (key === undefined || key === null || key === '') {
      res.status(400).json({ error: 'key is required' });
      return;
    }
    if (value === undefined) {
      res.status(400).json({ error: 'value is required' });
      return;
    }

    try {
      await query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, JSON.stringify(value)]
      );
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('site_settings PUT error:', err);
      res.status(500).json({ error: 'Failed to upsert setting' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}