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

const toSkillCamel = (row: Record<string, unknown>) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  years: row.years,
  proficiency: row.proficiency,
  icon: row.icon ?? null,
  sortOrder: row.sort_order,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const result = await query(
        'SELECT * FROM skills ORDER BY category ASC, sort_order ASC'
      );
      res.status(200).json(result.rows.map(toSkillCamel));
    } catch (err) {
      console.error('skills GET error:', err);
      res.status(500).json({ error: 'Failed to fetch skills' });
    }
    return;
  }

  const authed = await verifyClerkToken(req);
  if (!authed) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.method === 'POST') {
    const { name, category, years, proficiency, icon, sortOrder } = req.body ?? {};
    if (!name || !category || years === undefined || proficiency === undefined) {
      res.status(400).json({ error: 'name, category, years, and proficiency are required' });
      return;
    }
    try {
      const result = await query(
        `INSERT INTO skills (name, category, years, proficiency, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, category, years, proficiency, icon ?? null, sortOrder ?? 0]
      );
      res.status(201).json(toSkillCamel(result.rows[0]));
    } catch (err) {
      console.error('skills POST error:', err);
      res.status(500).json({ error: 'Failed to create skill' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const { id, name, category, years, proficiency, icon, sortOrder } = req.body ?? {};
    if (!id || !name || !category || years === undefined || proficiency === undefined) {
      res.status(400).json({ error: 'id, name, category, years, and proficiency are required' });
      return;
    }
    try {
      const result = await query(
        `UPDATE skills
         SET name=$1, category=$2, years=$3, proficiency=$4, icon=$5, sort_order=$6
         WHERE id=$7
         RETURNING *`,
        [name, category, years, proficiency, icon ?? null, sortOrder ?? 0, id]
      );
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      res.status(200).json(toSkillCamel(result.rows[0]));
    } catch (err) {
      console.error('skills PUT error:', err);
      res.status(500).json({ error: 'Failed to update skill' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.body ?? {};
    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    try {
      const result = await query('DELETE FROM skills WHERE id=$1', [id]);
      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('skills DELETE error:', err);
      res.status(500).json({ error: 'Failed to delete skill' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}