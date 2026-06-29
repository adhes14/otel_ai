import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import logger from '../utils/logger.js';

const router = Router();

// Helper to encode cursor to base64
function encodeCursor(lastSeenAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ lastSeenAt, id })).toString('base64');
}

// Helper to decode cursor from base64
function decodeCursor(cursorStr: string): { lastSeenAt: number; id: string } | null {
  try {
    const decoded = Buffer.from(cursorStr, 'base64').toString('utf-8');
    const parsed = JSON.parse(decoded);
    if (typeof parsed.lastSeenAt === 'number' && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch (err) {
    // ignore decoding errors
  }
  return null;
}

// GET /api/conversations - Cursor-paginated conversations list
router.get('/api/conversations', (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const cursorStr = req.query.cursor ? String(req.query.cursor) : null;

  try {
    let rows: any[] = [];
    const decoded = cursorStr ? decodeCursor(cursorStr) : null;

    if (decoded) {
      rows = db.prepare(`
        SELECT c.id, c.title, c.first_seen_at, c.last_seen_at, GROUP_CONCAT(DISTINCT s.model_name) as models
        FROM conversations c
        LEFT JOIN atomic_spans s ON c.id = s.conversation_id
        WHERE c.last_seen_at < ? OR (c.last_seen_at = ? AND c.id < ?)
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC, c.id DESC
        LIMIT ?
      `).all(decoded.lastSeenAt, decoded.lastSeenAt, decoded.id, limit);
    } else {
      rows = db.prepare(`
        SELECT c.id, c.title, c.first_seen_at, c.last_seen_at, GROUP_CONCAT(DISTINCT s.model_name) as models
        FROM conversations c
        LEFT JOIN atomic_spans s ON c.id = s.conversation_id
        GROUP BY c.id
        ORDER BY c.last_seen_at DESC, c.id DESC
        LIMIT ?
      `).all(limit);
    }

    // Format list response
    const conversations = rows.map(row => ({
      id: row.id,
      title: row.title,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      models: row.models ? row.models.split(',') : []
    }));

    let nextCursor: string | null = null;
    if (conversations.length === limit) {
      const lastItem = conversations[conversations.length - 1];
      nextCursor = encodeCursor(lastItem.last_seen_at, lastItem.id);
    }

    return res.status(200).json({
      conversations,
      next_cursor: nextCursor
    });
  } catch (err) {
    logger.error({ err }, 'Failed to query conversations list');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/conversations/:id - Detail with aggregated token totals and costs per model
router.get('/api/conversations/:id', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as any;
    if (!conversation) {
      return res.status(404).json({ error: `Conversation "${id}" not found` });
    }

    const aggregates = db.prepare(`
      SELECT
        s.model_name,
        SUM(s.input_tokens) as input_tokens,
        SUM(s.output_tokens) as output_tokens,
        SUM(s.cache_read_tokens) as cache_read_tokens,
        SUM(s.cache_write_tokens) as cache_write_tokens,
        SUM(s.reasoning_tokens) as reasoning_tokens,
        COALESCE(mc.input_cost_per_m, 0) as input_cost_per_m,
        COALESCE(mc.output_cost_per_m, 0) as output_cost_per_m,
        COALESCE(mc.cache_read_cost_per_m, 0) as cache_read_cost_per_m,
        COALESCE(mc.cache_write_cost_per_m, 0) as cache_write_cost_per_m,
        COALESCE(mc.reasoning_cost_per_m, 0) as reasoning_cost_per_m
      FROM atomic_spans s
      LEFT JOIN model_costs mc ON s.model_name = mc.model_name
      WHERE s.conversation_id = ?
      GROUP BY s.model_name
    `).all(id) as any[];

    // Calculate actual costs on the server side
    const model_breakdown = aggregates.map(row => {
      const inputTokens = Number(row.input_tokens);
      const outputTokens = Number(row.output_tokens);
      const cacheReadTokens = Number(row.cache_read_tokens);
      const cacheWriteTokens = Number(row.cache_write_tokens);
      const reasoningTokens = Number(row.reasoning_tokens);

      const inputCost = (inputTokens * Number(row.input_cost_per_m)) / 1_000_000;
      const outputCost = (outputTokens * Number(row.output_cost_per_m)) / 1_000_000;
      const cacheReadCost = (cacheReadTokens * Number(row.cache_read_cost_per_m)) / 1_000_000;
      const cacheWriteCost = (cacheWriteTokens * Number(row.cache_write_cost_per_m)) / 1_000_000;
      const reasoningCost = (reasoningTokens * Number(row.reasoning_cost_per_m)) / 1_000_000;
      
      const totalCost = inputCost + outputCost + cacheReadCost + cacheWriteCost + reasoningCost;

      return {
        model_name: row.model_name,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_read_tokens: cacheReadTokens,
        cache_write_tokens: cacheWriteTokens,
        reasoning_tokens: reasoningTokens,
        rates: {
          input_cost_per_m: row.input_cost_per_m,
          output_cost_per_m: row.output_cost_per_m,
          cache_read_cost_per_m: row.cache_read_cost_per_m,
          cache_write_cost_per_m: row.cache_write_cost_per_m,
          reasoning_cost_per_m: row.reasoning_cost_per_m
        },
        costs: {
          input_cost: Number(inputCost.toFixed(6)),
          output_cost: Number(outputCost.toFixed(6)),
          cache_read_cost: Number(cacheReadCost.toFixed(6)),
          cache_write_cost: Number(cacheWriteCost.toFixed(6)),
          reasoning_cost: Number(reasoningCost.toFixed(6)),
          total_cost: Number(totalCost.toFixed(6))
        }
      };
    });

    return res.status(200).json({
      id: conversation.id,
      title: conversation.title,
      first_seen_at: conversation.first_seen_at,
      last_seen_at: conversation.last_seen_at,
      model_breakdown
    });
  } catch (err) {
    logger.error({ err, id }, 'Failed to fetch conversation details');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET /api/conversations/:id/spans - List all atomic spans for a conversation
router.get('/api/conversations/:id/spans', (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const conversation = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id);
    if (!conversation) {
      return res.status(404).json({ error: `Conversation "${id}" not found` });
    }

    const spans = db.prepare(`
      SELECT * FROM atomic_spans
      WHERE conversation_id = ?
      ORDER BY created_at ASC, id ASC
    `).all(id);

    return res.status(200).json(spans);
  } catch (err) {
    logger.error({ err, id }, 'Failed to fetch atomic spans for conversation');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PATCH /api/conversations/:id - Update conversation title
router.patch('/api/conversations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { title } = req.body;

  if (typeof title !== 'string') {
    return res.status(400).json({ error: 'Title must be a string' });
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length === 0) {
    return res.status(400).json({ error: 'Title cannot be empty' });
  }
  if (trimmedTitle.length > 200) {
    return res.status(400).json({ error: 'Title must be 200 characters or less' });
  }

  try {
    const conversation = db.prepare('SELECT 1 FROM conversations WHERE id = ?').get(id);
    if (!conversation) {
      return res.status(404).json({ error: `Conversation "${id}" not found` });
    }

    db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(trimmedTitle, id);

    return res.status(200).json({ id, title: trimmedTitle });
  } catch (err) {
    logger.error({ err, id, title }, 'Failed to update conversation title');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
