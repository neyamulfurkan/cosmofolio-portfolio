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
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    return true;
  } catch {
    return false;
  }
};

const toLabItem = (row: Record<string, unknown>) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  description: row.description,
  technicalNotes: row.technical_notes ?? null,
  tags: row.tags ?? [],
  demoUrl: row.demo_url ?? null,
  githubUrl: row.github_url ?? null,
  embedType: row.embed_type ?? null,
  embedSrc: row.embed_src ?? null,
  published: row.published,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { method, query: qs } = req;

  if (method === 'GET') {
    const isAdmin = qs.admin === 'true';

    if (isAdmin) {
      const authed = await verifyClerkToken(req);
      if (!authed) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }

    try {
      const sql = isAdmin
        ? 'SELECT * FROM lab_items ORDER BY created_at DESC'
        : 'SELECT * FROM lab_items WHERE published = true ORDER BY created_at DESC';

      const result = await query(sql);
      res.status(200).json(result.rows.map(toLabItem));
    } catch (err) {
      console.error('GET lab_items error:', err);
      res.status(500).json({ error: 'Failed to fetch lab items' });
    }
    return;
  }

  if (method === 'POST') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      slug,
      title,
      description,
      technicalNotes,
      tags,
      demoUrl,
      githubUrl,
      embedType,
      embedSrc,
      published,
    } = req.body as Record<string, unknown>;

    if (!slug || !title || !description) {
      res.status(400).json({ error: 'slug, title, and description are required' });
      return;
    }

    try {
      const result = await query(
        `INSERT INTO lab_items
          (slug, title, description, technical_notes, tags, demo_url, github_url, embed_type, embed_src, published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          slug,
          title,
          description,
          technicalNotes ?? null,
          JSON.stringify(tags ?? []),
          demoUrl ?? null,
          githubUrl ?? null,
          embedType ?? null,
          embedSrc ?? null,
          published ?? false,
        ]
      );
      res.status(201).json(toLabItem(result.rows[0]));
    } catch (err) {
      console.error('POST lab_items error:', err);
      res.status(500).json({ error: 'Failed to create lab item' });
    }
    return;
  }

  if (method === 'PUT') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const {
      id,
      slug,
      title,
      description,
      technicalNotes,
      tags,
      demoUrl,
      githubUrl,
      embedType,
      embedSrc,
      published,
    } = req.body as Record<string, unknown>;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    if (!slug || !title || !description) {
      res.status(400).json({ error: 'slug, title, and description are required' });
      return;
    }

    try {
      const result = await query(
        `UPDATE lab_items
         SET slug = $1,
             title = $2,
             description = $3,
             technical_notes = $4,
             tags = $5,
             demo_url = $6,
             github_url = $7,
             embed_type = $8,
             embed_src = $9,
             published = $10,
             updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          slug,
          title,
          description,
          technicalNotes ?? null,
          JSON.stringify(tags ?? []),
          demoUrl ?? null,
          githubUrl ?? null,
          embedType ?? null,
          embedSrc ?? null,
          published ?? false,
          id,
        ]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Lab item not found' });
        return;
      }

      res.status(200).json(toLabItem(result.rows[0]));
    } catch (err) {
      console.error('PUT lab_items error:', err);
      res.status(500).json({ error: 'Failed to update lab item' });
    }
    return;
  }

  if (method === 'DELETE') {
    const authed = await verifyClerkToken(req);
    if (!authed) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { id } = req.body as Record<string, unknown>;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    try {
      const result = await query('DELETE FROM lab_items WHERE id = $1', [id]);

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Lab item not found' });
        return;
      }

      res.status(200).json({ success: true });
    } catch (err) {
      console.error('DELETE lab_items error:', err);
      res.status(500).json({ error: 'Failed to delete lab item' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}