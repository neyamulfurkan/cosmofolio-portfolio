import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

const AUTHORIZED_PARTIES = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
];
import { query } from '../../src/lib/db';

const verifyClerkToken = async (req: VercelRequest): Promise<boolean> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
   await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
      authorizedParties: [
        'http://localhost:3000',
        'http://localhost:5173',
        process.env.VITE_APP_URL ?? '',
      ].filter(Boolean),
    });
    return true;
  } catch (e) {
    console.error('[admin] token verify failed:', e);
    return false;
  }
};

const toRow = (row: Record<string, unknown>) => ({
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
        'SELECT * FROM achievements ORDER BY date DESC, sort_order ASC'
      );
      return void res.status(200).json(result.rows.map(toRow));
    } catch (err) {
      console.error('[achievements] GET error:', err);
      return void res.status(500).json({ error: 'Failed to fetch achievements' });
    }
  }

  if (req.method === 'POST') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) return void res.status(401).json({ error: 'Unauthorized' });

    const { title, type, organization, date, description, url, sortOrder } = req.body ?? {};

    if (!title || !type || !organization || !date || !description) {
      return void res.status(400).json({ error: 'title, type, organization, date, and description are required' });
    }

    const validTypes = ['award', 'win', 'publication', 'speaking', 'opensource'];
    if (!validTypes.includes(type)) {
      return void res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    try {
      const result = await query(
        `INSERT INTO achievements (title, type, organization, date, description, url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [title, type, organization, date, description, url ?? null, sortOrder ?? 0]
      );
      return void res.status(201).json(toRow(result.rows[0]));
    } catch (err) {
      console.error('[achievements] POST error:', err);
      return void res.status(500).json({ error: 'Failed to create achievement' });
    }
  }

  if (req.method === 'PUT') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) return void res.status(401).json({ error: 'Unauthorized' });

    const { id, title, type, organization, date, description, url, sortOrder } = req.body ?? {};

    if (!id) return void res.status(400).json({ error: 'id is required' });
    if (!title || !type || !organization || !date || !description) {
      return void res.status(400).json({ error: 'title, type, organization, date, and description are required' });
    }

    const validTypes = ['award', 'win', 'publication', 'speaking', 'opensource'];
    if (!validTypes.includes(type)) {
      return void res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
    }

    try {
      const result = await query(
        `UPDATE achievements
         SET title=$1, type=$2, organization=$3, date=$4, description=$5, url=$6, sort_order=$7
         WHERE id=$8
         RETURNING *`,
        [title, type, organization, date, description, url ?? null, sortOrder ?? 0, id]
      );
      if (result.rowCount === 0) return void res.status(404).json({ error: 'Achievement not found' });
      return void res.status(200).json(toRow(result.rows[0]));
    } catch (err) {
      console.error('[achievements] PUT error:', err);
      return void res.status(500).json({ error: 'Failed to update achievement' });
    }
  }

  if (req.method === 'DELETE') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) return void res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.body ?? {};
    if (!id) return void res.status(400).json({ error: 'id is required' });

    try {
      const result = await query('DELETE FROM achievements WHERE id=$1', [id]);
      if (result.rowCount === 0) return void res.status(404).json({ error: 'Achievement not found' });
      return void res.status(200).json({ success: true });
    } catch (err) {
      console.error('[achievements] DELETE error:', err);
      return void res.status(500).json({ error: 'Failed to delete achievement' });
    }
  }

  return void res.status(405).json({ error: 'Method not allowed' });
}