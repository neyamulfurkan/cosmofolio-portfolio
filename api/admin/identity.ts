import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyToken } from '@clerk/backend';

const AUTHORIZED_PARTIES = [
  'http://localhost:3000',
  'http://localhost:5173',
  ...(process.env.VITE_APP_URL ? [process.env.VITE_APP_URL] : []),
];
import { query } from '../../src/lib/db';

// ─── Auth ────────────────────────────────────────────────────────────────────

async function verifyClerkToken(req: VercelRequest): Promise<boolean> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY ?? '',
      authorizedParties: AUTHORIZED_PARTIES,
      skipJwtSignatureValidation: process.env.NODE_ENV !== 'production',
    });
    return true;
  } catch (e) {
    console.error('[identity] token verify failed:', e);
    return false;
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

interface IdentityRow {
  id: number;
  name: string;
  title_variants: string[];
  tagline: string;
  availability_status: string;
  availability_label: string;
  about_story: string;
  about_photo_url: string | null;
  resume_url: string | null;
  resume_updated_at: string | null;
  values: { icon: string; label: string; description: string }[];
  fun_facts: string[];
  social_links: { platform: string; url: string; icon: string }[];
  created_at: string;
  updated_at: string;
}

function mapIdentity(row: IdentityRow) {
  return {
    id: row.id,
    name: row.name,
    titleVariants: row.title_variants ?? [],
    tagline: row.tagline,
    availabilityStatus: row.availability_status,
    availabilityLabel: row.availability_label,
    aboutStory: row.about_story,
    aboutPhotoUrl: row.about_photo_url,
    resumeUrl: row.resume_url,
    resumeUpdatedAt: row.resume_updated_at,
    values: row.values ?? [],
    funFacts: row.fun_facts ?? [],
    socialLinks: row.social_links ?? [],
  };
}

// ─── Full content aggregation ─────────────────────────────────────────────────

async function getFullContent() {
  const [
    identityRes,
    projectsRes,
    skillsRes,
    experienceRes,
    educationRes,
    certificationsRes,
    blogRes,
    labRes,
    achievementsRes,
  ] = await Promise.all([
    query('SELECT * FROM identity WHERE id = 1 LIMIT 1'),
    query(`
      SELECT id, slug, title, tagline, cover_image_url, cover_video_url,
             problem_text, approach_text, build_text, result_text,
             tech_stack, live_url, github_url, tags, featured, sort_order, published
      FROM projects
      WHERE published = true
      ORDER BY sort_order ASC
    `),
    query('SELECT * FROM skills ORDER BY category ASC, sort_order ASC'),
    query('SELECT * FROM experience ORDER BY start_date DESC'),
    query('SELECT * FROM education ORDER BY sort_order ASC'),
    query('SELECT * FROM certifications ORDER BY sort_order ASC'),
    query(`
      SELECT id, slug, title, cover_image_url, category, reading_time_minutes,
             content, excerpt, published, published_at, tags, sort_order
      FROM blog_posts
      WHERE published = true
      ORDER BY published_at DESC
    `),
    query(`
      SELECT id, slug, title, description, technical_notes, tags,
             demo_url, github_url, embed_type, embed_src, published
      FROM lab_items
      WHERE published = true
      ORDER BY created_at DESC
    `),
    query('SELECT * FROM achievements ORDER BY date DESC'),
  ]);

  const identity = identityRes.rows[0] ? mapIdentity(identityRes.rows[0] as IdentityRow) : null;

  const projects = projectsRes.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    tagline: r.tagline,
    coverImageUrl: r.cover_image_url,
    coverVideoUrl: r.cover_video_url,
    problemText: r.problem_text,
    approachText: r.approach_text,
    buildText: r.build_text,
    resultText: r.result_text,
    techStack: r.tech_stack ?? [],
    liveUrl: r.live_url,
    githubUrl: r.github_url,
    tags: r.tags ?? [],
    featured: r.featured,
    sortOrder: r.sort_order,
    published: r.published,
  }));

  const skills = skillsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    years: r.years,
    proficiency: r.proficiency,
    icon: r.icon,
    sortOrder: r.sort_order,
  }));

  const experience = experienceRes.rows.map((r) => ({
    id: r.id,
    company: r.company,
    role: r.role,
    startDate: r.start_date,
    endDate: r.end_date,
    description: r.description,
    techUsed: r.tech_used ?? [],
    companyUrl: r.company_url,
    sortOrder: r.sort_order,
  }));

  const education = educationRes.rows.map((r) => ({
    id: r.id,
    institution: r.institution,
    degree: r.degree,
    field: r.field,
    startDate: r.start_date,
    endDate: r.end_date,
    description: r.description,
    sortOrder: r.sort_order,
  }));

  const certifications = certificationsRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    issuer: r.issuer,
    issuedDate: r.issued_date,
    verifyUrl: r.verify_url,
    badgeUrl: r.badge_url,
    sortOrder: r.sort_order,
  }));

  const blogPosts = blogRes.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    coverImageUrl: r.cover_image_url,
    category: r.category,
    readingTimeMinutes: r.reading_time_minutes,
    content: r.content,
    excerpt: r.excerpt,
    published: r.published,
    publishedAt: r.published_at,
    tags: r.tags ?? [],
    sortOrder: r.sort_order,
  }));

  const labItems = labRes.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    technicalNotes: r.technical_notes,
    tags: r.tags ?? [],
    demoUrl: r.demo_url,
    githubUrl: r.github_url,
    embedType: r.embed_type,
    embedSrc: r.embed_src,
    published: r.published,
  }));

  const achievements = achievementsRes.rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    organization: r.organization,
    date: r.date,
    description: r.description,
    url: r.url,
    sortOrder: r.sort_order,
  }));

  return {
    identity,
    projects,
    skills,
    experience,
    education,
    certifications,
    blogPosts,
    labItems,
    achievements,
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // ── GET ──────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    // ?full=true — aggregate all public content for contentLoader.ts
    if (req.query.full === 'true') {
      try {
        const data = await getFullContent();
        return void res.status(200).json(data);
      } catch (err) {
        console.error('[identity] GET ?full=true error:', err);
        return void res.status(500).json({ error: 'Failed to load content' });
      }
    }

    // Default: return single identity row
    try {
      const result = await query('SELECT * FROM identity WHERE id = 1 LIMIT 1');
      if (!result.rows[0]) {
        return void res.status(404).json({ error: 'Identity not found' });
      }
      return void res.status(200).json(mapIdentity(result.rows[0] as IdentityRow));
    } catch (err) {
      console.error('[identity] GET error:', err);
      return void res.status(500).json({ error: 'Failed to fetch identity' });
    }
  }

  // ── POST — upsert ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const authed = await verifyClerkToken(req);
    if (!authed) return void res.status(401).json({ error: 'Unauthorized' });

    const {
      name,
      titleVariants,
      tagline,
      availabilityStatus,
      availabilityLabel,
      aboutStory,
      aboutPhotoUrl,
      resumeUrl,
      resumeUpdatedAt,
      values,
      funFacts,
      socialLinks,
    } = req.body as Record<string, unknown>;

    if (!name || !tagline || !availabilityStatus || !availabilityLabel || !aboutStory) {
      return void res.status(400).json({ error: 'Missing required fields: name, tagline, availabilityStatus, availabilityLabel, aboutStory' });
    }

    try {
      const result = await query(
        `INSERT INTO identity (
          id, name, title_variants, tagline, availability_status, availability_label,
          about_story, about_photo_url, resume_url, resume_updated_at,
          values, fun_facts, social_links, updated_at
        ) VALUES (
          1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          name               = EXCLUDED.name,
          title_variants     = EXCLUDED.title_variants,
          tagline            = EXCLUDED.tagline,
          availability_status = EXCLUDED.availability_status,
          availability_label = EXCLUDED.availability_label,
          about_story        = EXCLUDED.about_story,
          about_photo_url    = EXCLUDED.about_photo_url,
          resume_url         = EXCLUDED.resume_url,
          resume_updated_at  = EXCLUDED.resume_updated_at,
          values             = EXCLUDED.values,
          fun_facts          = EXCLUDED.fun_facts,
          social_links       = EXCLUDED.social_links,
          updated_at         = NOW()
        RETURNING *`,
        [
          name,
          JSON.stringify(titleVariants ?? []),
          tagline,
          availabilityStatus,
          availabilityLabel,
          aboutStory,
          aboutPhotoUrl ?? null,
          resumeUrl ?? null,
          resumeUpdatedAt ?? null,
          JSON.stringify(values ?? []),
          JSON.stringify(funFacts ?? []),
          JSON.stringify(socialLinks ?? []),
        ]
      );

      return void res.status(200).json(mapIdentity(result.rows[0] as IdentityRow));
    } catch (err) {
      console.error('[identity] POST error:', err);
      return void res.status(500).json({ error: 'Failed to upsert identity' });
    }
  }

  // ── PUT — partial update ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const authed = await verifyClerkToken(req);
    if (!authed) return void res.status(401).json({ error: 'Unauthorized' });

    const body = req.body as Record<string, unknown>;
    if (!body || Object.keys(body).length === 0) {
      return void res.status(400).json({ error: 'Request body is empty' });
    }

    // Map allowed camelCase fields to snake_case DB columns
    const fieldMap: Record<string, string> = {
      name: 'name',
      titleVariants: 'title_variants',
      tagline: 'tagline',
      availabilityStatus: 'availability_status',
      availabilityLabel: 'availability_label',
      aboutStory: 'about_story',
      aboutPhotoUrl: 'about_photo_url',
      resumeUrl: 'resume_url',
      resumeUpdatedAt: 'resume_updated_at',
      values: 'values',
      funFacts: 'fun_facts',
      socialLinks: 'social_links',
    };

    // JSONB fields that must be stringified
    const jsonbFields = new Set(['title_variants', 'values', 'fun_facts', 'social_links']);

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const [camel, value] of Object.entries(body)) {
      const col = fieldMap[camel];
      if (!col) continue; // ignore unknown fields
      const dbValue = jsonbFields.has(col) ? JSON.stringify(value) : value;
      setClauses.push(`${col} = $${paramIndex}`);
      params.push(dbValue);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return void res.status(400).json({ error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(1); // WHERE id = $N

    try {
      const result = await query(
        `UPDATE identity SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
        params
      );

      if (!result.rows[0]) {
        return void res.status(404).json({ error: 'Identity row not found — run POST first to create it' });
      }

      return void res.status(200).json(mapIdentity(result.rows[0] as IdentityRow));
    } catch (err) {
      console.error('[identity] PUT error:', err);
      return void res.status(500).json({ error: 'Failed to update identity' });
    }
  }

  // ── Unsupported method ────────────────────────────────────────────────────
  res.setHeader('Allow', 'GET, POST, PUT');
  return void res.status(405).json({ error: `Method ${req.method} not allowed` });
}