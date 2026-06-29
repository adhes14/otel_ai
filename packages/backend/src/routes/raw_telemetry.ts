import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import logger from '../utils/logger.js';

const router = Router();

// Helper to encode cursor to base64
function encodeCursor(lastId: number): string {
  return Buffer.from(JSON.stringify({ lastId })).toString('base64');
}

// Helper to decode cursor from base64
function decodeCursor(cursorStr: string): { lastId: number } | null {
  try {
    const decoded = Buffer.from(cursorStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (typeof parsed.lastId === 'number') {
      return parsed;
    }
  } catch (err) {
    // ignore decoding errors
  }
  return null;
}

// GET /api/raw-telemetry - List all raw telemetries (cursor-paginated) with search filter
router.get('/api/raw-telemetry', (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const cursorStr = req.query.cursor ? String(req.query.cursor) : null;
  const search = req.query.search ? String(req.query.search).trim() : null;

  try {
    let rows: any[] = [];
    const decoded = cursorStr ? decodeCursor(cursorStr) : null;

    let query = `
      SELECT id, conversation_id, LENGTH(payload) as payload_size, created_at
      FROM raw_telemetry
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (decoded) {
      conditions.push('id < ?');
      params.push(decoded.lastId);
    }

    if (search) {
      conditions.push('(conversation_id LIKE ? OR payload LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY id DESC LIMIT ?`;
    params.push(limit);

    rows = db.prepare(query).all(...params);

    const telemetries = rows.map(row => ({
      id: row.id,
      conversation_id: row.conversation_id,
      payload_size: row.payload_size,
      created_at: row.created_at
    }));

    let nextCursor: string | null = null;
    if (telemetries.length === limit) {
      const lastItem = telemetries[telemetries.length - 1];
      nextCursor = encodeCursor(lastItem.id);
    }

    return res.status(200).json({
      telemetries,
      next_cursor: nextCursor
    });
  } catch (err) {
    logger.error({ err }, 'Failed to query raw telemetry list');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/raw-telemetry/:id - Fetch details of a single raw telemetry trace
router.get('/api/raw-telemetry/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const row = db.prepare('SELECT id, conversation_id, payload, created_at FROM raw_telemetry WHERE id = ?').get(id) as any;
    if (!row) {
      return res.status(404).json({ error: `Raw telemetry with ID "${id}" not found` });
    }

    let parsedPayload: any = null;
    try {
      parsedPayload = JSON.parse(row.payload);
    } catch (parseErr) {
      parsedPayload = row.payload; // Fallback to raw text if not JSON
    }

    return res.status(200).json({
      id: row.id,
      conversation_id: row.conversation_id,
      payload: parsedPayload,
      created_at: row.created_at
    });
  } catch (err) {
    logger.error({ err, id }, 'Failed to fetch raw telemetry details');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/conversations/:id/raw-telemetry - List raw telemetry IDs associated with a specific conversation
router.get('/api/conversations/:id/raw-telemetry', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const conversation = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id);
    if (!conversation) {
      return res.status(404).json({ error: `Conversation "${id}" not found` });
    }

    const rows = db.prepare(`
      SELECT id, created_at, LENGTH(payload) as payload_size
      FROM raw_telemetry
      WHERE conversation_id = ?
      ORDER BY id ASC
    `).all(id);

    return res.status(200).json(rows);
  } catch (err) {
    logger.error({ err, id }, 'Failed to fetch raw telemetry for conversation');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
