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

function toEducationCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    field: row.field,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    description: row.description ?? null,
    sortOrder: row.sort_order,
  };
}

function toCertificationCamel(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    issuedDate: row.issued_date,
    verifyUrl: row.verify_url ?? null,
    badgeUrl: row.badge_url ?? null,
    sortOrder: row.sort_order,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'GET') {
    try {
      const [eduResult, certResult] = await Promise.all([
        query('SELECT * FROM education ORDER BY sort_order ASC, start_date DESC'),
        query('SELECT * FROM certifications ORDER BY sort_order ASC, issued_date DESC'),
      ]);

      res.status(200).json({
        education: eduResult.rows.map(toEducationCamel),
        certifications: certResult.rows.map(toCertificationCamel),
      });
    } catch (err) {
      console.error('GET education/certifications error:', err);
      res.status(500).json({ error: 'Failed to fetch education and certifications' });
    }
    return;
  }

  if (req.method === 'POST') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const type = req.body?.type as string | undefined;

    if (type === 'education') {
      const { institution, degree, field, start_date, end_date, description, sort_order } = req.body;
      if (!institution || !degree || !field || !start_date) {
        res.status(400).json({ error: 'institution, degree, field, and start_date are required' });
        return;
      }
      try {
        const result = await query(
          `INSERT INTO education (institution, degree, field, start_date, end_date, description, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [institution, degree, field, start_date, end_date ?? null, description ?? null, sort_order ?? 0]
        );
        res.status(201).json(toEducationCamel(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error('POST education error:', err);
        res.status(500).json({ error: 'Failed to create education entry' });
      }
      return;
    }

    if (type === 'certification') {
      const { name, issuer, issued_date, verify_url, badge_url, sort_order } = req.body;
      if (!name || !issuer || !issued_date) {
        res.status(400).json({ error: 'name, issuer, and issued_date are required' });
        return;
      }
      try {
        const result = await query(
          `INSERT INTO certifications (name, issuer, issued_date, verify_url, badge_url, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [name, issuer, issued_date, verify_url ?? null, badge_url ?? null, sort_order ?? 0]
        );
        res.status(201).json(toCertificationCamel(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error('POST certification error:', err);
        res.status(500).json({ error: 'Failed to create certification' });
      }
      return;
    }

    res.status(400).json({ error: 'type must be "education" or "certification"' });
    return;
  }

  if (req.method === 'PUT') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const type = (req.body?.type ?? req.query?.type) as string | undefined;
    const { id } = req.body;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    if (type === 'education') {
      const { institution, degree, field, start_date, end_date, description, sort_order } = req.body;
      if (!institution || !degree || !field || !start_date) {
        res.status(400).json({ error: 'institution, degree, field, and start_date are required' });
        return;
      }
      try {
        const result = await query(
          `UPDATE education
           SET institution = $1, degree = $2, field = $3, start_date = $4,
               end_date = $5, description = $6, sort_order = $7
           WHERE id = $8
           RETURNING *`,
          [institution, degree, field, start_date, end_date ?? null, description ?? null, sort_order ?? 0, id]
        );
        if (result.rowCount === 0) {
          res.status(404).json({ error: 'Education entry not found' });
          return;
        }
        res.status(200).json(toEducationCamel(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error('PUT education error:', err);
        res.status(500).json({ error: 'Failed to update education entry' });
      }
      return;
    }

    if (type === 'certification') {
      const { name, issuer, issued_date, verify_url, badge_url, sort_order } = req.body;
      if (!name || !issuer || !issued_date) {
        res.status(400).json({ error: 'name, issuer, and issued_date are required' });
        return;
      }
      try {
        const result = await query(
          `UPDATE certifications
           SET name = $1, issuer = $2, issued_date = $3,
               verify_url = $4, badge_url = $5, sort_order = $6
           WHERE id = $7
           RETURNING *`,
          [name, issuer, issued_date, verify_url ?? null, badge_url ?? null, sort_order ?? 0, id]
        );
        if (result.rowCount === 0) {
          res.status(404).json({ error: 'Certification not found' });
          return;
        }
        res.status(200).json(toCertificationCamel(result.rows[0] as Record<string, unknown>));
      } catch (err) {
        console.error('PUT certification error:', err);
        res.status(500).json({ error: 'Failed to update certification' });
      }
      return;
    }

    res.status(400).json({ error: 'type must be "education" or "certification"' });
    return;
  }

  if (req.method === 'DELETE') {
    const authorized = await verifyClerkToken(req);
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const type = (req.body?.type ?? req.query?.type) as string | undefined;
    const id = req.body?.id ?? req.query?.id;

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }

    if (type === 'education') {
      try {
        const result = await query('DELETE FROM education WHERE id = $1', [id]);
        if (result.rowCount === 0) {
          res.status(404).json({ error: 'Education entry not found' });
          return;
        }
        res.status(200).json({ success: true });
      } catch (err) {
        console.error('DELETE education error:', err);
        res.status(500).json({ error: 'Failed to delete education entry' });
      }
      return;
    }

    if (type === 'certification') {
      try {
        const result = await query('DELETE FROM certifications WHERE id = $1', [id]);
        if (result.rowCount === 0) {
          res.status(404).json({ error: 'Certification not found' });
          return;
        }
        res.status(200).json({ success: true });
      } catch (err) {
        console.error('DELETE certification error:', err);
        res.status(500).json({ error: 'Failed to delete certification' });
      }
      return;
    }

    res.status(400).json({ error: 'type must be "education" or "certification"' });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}