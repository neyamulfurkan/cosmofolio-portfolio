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
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return false;
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return true;
  } catch {
    return false;
  }
};

type ExperienceRow = {
  id: string;
  company: string;
  role: string;
  start_date: string;
  end_date: string | null;
  description: string;
  tech_used: string[];
  company_url: string | null;
  sort_order: number;
};

const toExperience = (row: ExperienceRow) => ({
  id: row.id,
  company: row.company,
  role: row.role,
  startDate: row.start_date,
  endDate: row.end_date ?? null,
  description: row.description,
  techUsed: Array.isArray(row.tech_used) ? row.tech_used : JSON.parse(row.tech_used as unknown as string ?? '[]'),
  companyUrl: row.company_url ?? null,
  sortOrder: row.sort_order,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    const isAdmin = req.query.admin === 'true';

    if (isAdmin) {
      const authed = await verifyClerkToken(req);
      if (!authed) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const result = await query<ExperienceRow>(
        'SELECT * FROM experience ORDER BY start_date DESC'
      );
      res.status(200).json(result.rows.map(toExperience));
    } catch (err) {
      console.error('GET experience error:', err);
      res.status(500).json({ error: 'Failed to fetch experience' });
    }
    return;
  }

  if (req.method === 'POST') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { company, role, startDate, endDate, description, techUsed, companyUrl, sortOrder } = req.body ?? {};

    if (!company || !role || !startDate || !description) {
      res.status(400).json({ error: 'company, role, startDate, and description are required' });
      return;
    }

    try {
      const result = await query<ExperienceRow>(
        `INSERT INTO experience (company, role, start_date, end_date, description, tech_used, company_url, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          company,
          role,
          startDate,
          endDate ?? null,
          description,
          JSON.stringify(techUsed ?? []),
          companyUrl ?? null,
          sortOrder ?? 0,
        ]
      );
      res.status(201).json(toExperience(result.rows[0]));
    } catch (err) {
      console.error('POST experience error:', err);
      res.status(500).json({ error: 'Failed to create experience entry' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id, company, role, startDate, endDate, description, techUsed, companyUrl, sortOrder } = req.body ?? {};

    if (!id || !company || !role || !startDate || !description) {
      res.status(400).json({ error: 'id, company, role, startDate, and description are required' });
      return;
    }

    try {
      const result = await query<ExperienceRow>(
        `UPDATE experience
         SET company = $1, role = $2, start_date = $3, end_date = $4, description = $5,
             tech_used = $6, company_url = $7, sort_order = $8
         WHERE id = $9
         RETURNING *`,
        [
          company,
          role,
          startDate,
          endDate ?? null,
          description,
          JSON.stringify(techUsed ?? []),
          companyUrl ?? null,
          sortOrder ?? 0,
          id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Experience entry not found' });
        return;
      }

      res.status(200).json(toExperience(result.rows[0]));
    } catch (err) {
      console.error('PUT experience error:', err);
      res.status(500).json({ error: 'Failed to update experience entry' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const id = req.query.id as string;
    if (!id) {
      res.status(400).json({ error: 'id query param is required' });
      return;
    }

    try {
      const result = await query('DELETE FROM experience WHERE id = $1', [id]);

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Experience entry not found' });
        return;
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('DELETE experience error:', err);
      res.status(500).json({ error: 'Failed to delete experience entry' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}