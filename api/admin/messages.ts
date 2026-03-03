import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

const AUTHORIZED_PARTIES = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
];
import { query } from '../../src/lib/db';

const verifyClerkToken = async (req: VercelRequest): Promise<boolean> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return true;
  } catch {
    return false;
  }
};

const VALID_TYPES = ['award', 'win', 'publication', 'speaking', 'opensource'] as const;

type AchievementType = (typeof VALID_TYPES)[number];

const isValidType = (value: unknown): value is AchievementType =>
  typeof value === 'string' && (VALID_TYPES as readonly string[]).includes(value);

const toAchievementRow = (row: Record<string, unknown>) => ({
  id: row.id,
  title: row.title,
  type: row.type,
  organization: row.organization,
  date: row.date,
  description: row.description,
  url: row.url ?? null,
  sortOrder: row.sort_order,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET') {
    try {
      const result = await query(
        'SELECT * FROM achievements ORDER BY date DESC'
      );
      const achievements = result.rows.map(toAchievementRow);
      res.status(200).json(achievements);
    } catch (err) {
      console.error('GET /api/admin/achievements error:', err);
      res.status(500).json({ error: 'Failed to fetch achievements' });
    }
    return;
  }

  if (req.method === 'POST') {
    const isAuthed = await verifyClerkToken(req);
    if (!isAuthed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { title, type, organization, date, description, url, sort_order } = req.body ?? {};

    if (!title || !type || !organization || !date || !description) {
      res.status(400).json({ error: 'title, type, organization, date, and description are required' });
      return;
    }

    if (!isValidType(type)) {
      res.status(400).json({
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      });
      return;
    }

    try {
      const result = await query(
        `INSERT INTO achievements (title, type, organization, date, description, url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [title, type, organization, date, description, url ?? null, sort_order ?? 0]
      );
      res.status(201).json(toAchievementRow(result.rows[0] as Record<string, unknown>));
    } catch (err) {
      console.error('POST /api/admin/achievements error:', err);
      res.status(500).json({ error: 'Failed to create achievement' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const isAuthed = await verifyClerkToken(req);
    if (!isAuthed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id, title, type, organization, date, description, url, sort_order } = req.body ?? {};

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    if (!title || !type || !organization || !date || !description) {
      res.status(400).json({ error: 'title, type, organization, date, and description are required' });
      return;
    }

    if (!isValidType(type)) {
      res.status(400).json({
        error: `type must be one of: ${VALID_TYPES.join(', ')}`,
      });
      return;
    }

    try {
      const result = await query(
        `UPDATE achievements
         SET title = $1, type = $2, organization = $3, date = $4,
             description = $5, url = $6, sort_order = $7
         WHERE id = $8
         RETURNING *`,
        [title, type, organization, date, description, url ?? null, sort_order ?? 0, id]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Achievement not found' });
        return;
      }

      res.status(200).json(toAchievementRow(result.rows[0] as Record<string, unknown>));
    } catch (err) {
      console.error('PUT /api/admin/achievements error:', err);
      res.status(500).json({ error: 'Failed to update achievement' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const isAuthed = await verifyClerkToken(req);
    if (!isAuthed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.body ?? {};

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    try {
      const result = await query('DELETE FROM achievements WHERE id = $1 RETURNING id', [id]);

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Achievement not found' });
        return;
      }

      res.status(200).json({ success: true, id });
    } catch (err) {
      console.error('DELETE /api/admin/achievements error:', err);
      res.status(500).json({ error: 'Failed to delete achievement' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}