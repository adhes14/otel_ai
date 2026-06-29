import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import logger from '../utils/logger.js';
import { processTelemetry } from '../services/telemetryProcessor.js';

const router = Router();

// Helper to extract gen_ai.conversation.id from OTLP payload structure
function extractConversationId(body: any): string | null {
  try {
    if (!body || typeof body !== 'object') return null;

    if (body.resourceSpans && Array.isArray(body.resourceSpans)) {
      for (const resSpan of body.resourceSpans) {
        if (resSpan.scopeSpans && Array.isArray(resSpan.scopeSpans)) {
          for (const scopeSpan of resSpan.scopeSpans) {
            if (scopeSpan.spans && Array.isArray(scopeSpan.spans)) {
              for (const span of scopeSpan.spans) {
                if (span.attributes && Array.isArray(span.attributes)) {
                  for (const attr of span.attributes) {
                    if (attr.key === 'gen_ai.conversation.id') {
                      const val = attr.value;
                      if (val) {
                        if (typeof val === 'string') return val;
                        if (typeof val === 'object') {
                          if ('stringValue' in val) return val.stringValue as string;
                          if ('value' in val) return String(val.value);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logger.debug({ err }, 'Failed to parse conversation ID from trace payload');
  }
  return null;
}

// POST /v1/traces
// Supports application/json and application/x-protobuf (OTel standard)
router.post('/v1/traces', (req: Request, res: Response) => {
  const contentType = req.headers['content-type'] || '';

  if (!contentType.includes('application/json') && !contentType.includes('application/x-protobuf')) {
    logger.warn({ contentType }, 'Unsupported Content-Type');
    return res.status(415).json({
      error: 'Unsupported Media Type. Only application/json and application/x-protobuf are allowed.'
    });
  }

  const payload = req.body;
  const conversationId = extractConversationId(payload);

  try {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

    const stmt = db.prepare(`
      INSERT INTO raw_telemetry (conversation_id, payload)
      VALUES (?, ?)
    `);

    const result = stmt.run(conversationId, payloadStr);
    const rawId = Number(result.lastInsertRowid);

    logger.info({
      traceId: rawId,
      conversationId,
      payloadSize: payloadStr.length
    }, 'Telemetry trace persisted successfully');

    // Trigger background processing asynchronously
    setImmediate(() => {
      processTelemetry(rawId, payload);
    });

    return res.status(200).json({
      status: 'ok',
      id: rawId
    });
  } catch (err) {
    logger.error({ err }, 'Failed to persist telemetry trace');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : String(err)
    });
  }
});

export default router;
