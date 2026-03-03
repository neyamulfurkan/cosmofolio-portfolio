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

const mapRow = (row: Record<string, unknown>) => ({
  id: row.id,
  slug: row.slug,
  title: row.title,
  coverImageUrl: row.cover_image_url,
  category: row.category,
  readingTimeMinutes: row.reading_time_minutes,
  content: row.content,
  excerpt: row.excerpt,
  published: row.published,
  publishedAt: row.published_at instanceof Date
    ? (row.published_at as Date).toISOString()
    : (row.published_at ?? null),
  tags: row.tags,
  sortOrder: row.sort_order,
  createdAt: row.created_at instanceof Date
    ? (row.created_at as Date).toISOString()
    : row.created_at,
  updatedAt: row.updated_at instanceof Date
    ? (row.updated_at as Date).toISOString()
    : row.updated_at,
});

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const isAdmin = req.query.admin === 'true';

  if (req.method === 'GET') {
    try {
      let result;
      if (isAdmin) {
        const authed = await verifyClerkToken(req);
        if (!authed) {
          res.status(401).json({ error: 'Unauthorized' });
          return;
        }
        result = await query(
          'SELECT * FROM blog_posts ORDER BY sort_order ASC, created_at DESC'
        );
      } else {
        result = await query(
          'SELECT * FROM blog_posts WHERE published = true ORDER BY published_at DESC, sort_order ASC'
        );
      }
      res.status(200).json(result.rows.map(mapRow));
    } catch (err) {
      console.error('[blog GET]', err);
      res.status(500).json({ error: 'Failed to fetch blog posts' });
    }
    return;
  }

  const authed = await verifyClerkToken(req);
  if (!authed) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (req.method === 'POST') {
    const {
      slug,
      title,
      coverImageUrl,
      category,
      readingTimeMinutes,
      content,
      excerpt,
      published,
      tags,
      sortOrder,
    } = req.body as Record<string, unknown>;

    if (!slug || !title || !category || !content || !excerpt) {
      res.status(400).json({ error: 'slug, title, category, content, and excerpt are required' });
      return;
    }

    try {
      const isPublished = Boolean(published);
      const result = await query(
        `INSERT INTO blog_posts
          (slug, title, cover_image_url, category, reading_time_minutes, content, excerpt,
           published, published_at, tags, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          slug,
          title,
          coverImageUrl ?? null,
          category,
          readingTimeMinutes ?? 1,
          content,
          excerpt,
          isPublished,
          isPublished ? new Date().toISOString() : null,
          JSON.stringify(tags ?? []),
          sortOrder ?? 0,
        ]
      );
      res.status(201).json(mapRow(result.rows[0]));
    } catch (err) {
      console.error('[blog POST]', err);
      res.status(500).json({ error: 'Failed to create blog post' });
    }
    return;
  }

  if (req.method === 'PUT') {
    const {
      id,
      slug,
      title,
      coverImageUrl,
      category,
      readingTimeMinutes,
      content,
      excerpt,
      published,
      publishedAt,
      tags,
      sortOrder,
    } = req.body as Record<string, unknown>;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    try {
      const existing = await query(
        'SELECT published, published_at FROM blog_posts WHERE id = $1',
        [id]
      );
      if (existing.rows.length === 0) {
        res.status(404).json({ error: 'Blog post not found' });
        return;
      }

      const wasPublished = existing.rows[0].published as boolean;
      const isPublished = published !== undefined ? Boolean(published) : wasPublished;

      let resolvedPublishedAt: string | null;
      if (publishedAt !== undefined) {
        resolvedPublishedAt = publishedAt as string | null;
      } else if (isPublished && !wasPublished) {
        resolvedPublishedAt = new Date().toISOString();
      } else {
        const raw = existing.rows[0].published_at;
        resolvedPublishedAt = raw instanceof Date ? raw.toISOString() : (raw as string | null);
      }

      const result = await query(
        `UPDATE blog_posts SET
          slug = COALESCE($1, slug),
          title = COALESCE($2, title),
          cover_image_url = $3,
          category = COALESCE($4, category),
          reading_time_minutes = COALESCE($5, reading_time_minutes),
          content = COALESCE($6, content),
          excerpt = COALESCE($7, excerpt),
          published = $8,
          published_at = $9,
          tags = COALESCE($10, tags),
          sort_order = COALESCE($11, sort_order),
          updated_at = NOW()
        WHERE id = $12
        RETURNING *`,
        [
          slug ?? null,
          title ?? null,
          coverImageUrl !== undefined ? (coverImageUrl ?? null) : null,
          category ?? null,
          readingTimeMinutes ?? null,
          content ?? null,
          excerpt ?? null,
          isPublished,
          resolvedPublishedAt,
          tags !== undefined ? JSON.stringify(tags) : null,
          sortOrder ?? null,
          id,
        ]
      );

      res.status(200).json(mapRow(result.rows[0]));
    } catch (err) {
      console.error('[blog PUT]', err);
      res.status(500).json({ error: 'Failed to update blog post' });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { id } = req.body as Record<string, unknown>;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    try {
      const result = await query(
        'DELETE FROM blog_posts WHERE id = $1 RETURNING id',
        [id]
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Blog post not found' });
        return;
      }
      res.status(200).json({ success: true, id });
    } catch (err) {
      console.error('[blog DELETE]', err);
      res.status(500).json({ error: 'Failed to delete blog post' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}