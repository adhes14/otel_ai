import { db } from '../db/database.js';
import logger from '../utils/logger.js';
import { getTelemetryResolver } from './telemetry/resolvers.js';

export function processTelemetry(rawId: number, rawPayload: string | object) {
  try {
    let payload: any;
    if (typeof rawPayload === 'string') {
      payload = JSON.parse(rawPayload);
    } else {
      payload = rawPayload;
    }

    if (!payload || typeof payload !== 'object') return;

    const resourceSpans = payload.resourceSpans;
    if (!resourceSpans || !Array.isArray(resourceSpans)) return;

    const spans = resourceSpans
      .flatMap((r: any) => r?.scopeSpans || [])
      .flatMap((s: any) => s?.spans || []);

    db.transaction(() => {
      const resolver = getTelemetryResolver(payload);
      const source = resolver.resolveSource();

      // Pre-scan all spans to build a map of traceId -> chatSessionId, subagentAliasMap and subagentNameMap
      const traceSessionMap = new Map<string, string>();
      const subagentAliasMap = new Map<string, string>();
      const subagentNameMap = new Map<string, string>();
      resolver.preScanSpans(spans, traceSessionMap, subagentAliasMap, subagentNameMap);

      const processableSpans = resolver.resolveSpans(spans, traceSessionMap, subagentAliasMap, subagentNameMap);

      for (const pSpan of processableSpans) {
        // 1. Model Auto-Discovery: Hot insertion of model costs at $0.00
        db.prepare(`
          INSERT OR IGNORE INTO model_costs (
            model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m
          ) VALUES (?, 0, 0, 0, 0, 0)
        `).run(pSpan.modelName);

        // 2. Upsert Conversation
        const existingConv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(pSpan.conversationId) as any;
        if (!existingConv) {
          db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at, source) VALUES (?, ?, ?, ?, ?)').run(
            pSpan.conversationId,
            pSpan.fallbackTitle || null,
            pSpan.createdAt,
            pSpan.createdAt,
            source
          );
        } else {
          db.prepare('UPDATE conversations SET title = ?, first_seen_at = ?, last_seen_at = ?, source = ? WHERE id = ?').run(
            existingConv.title || pSpan.fallbackTitle || null,
            Math.min(existingConv.first_seen_at, pSpan.createdAt),
            Math.max(existingConv.last_seen_at, pSpan.createdAt),
            existingConv.source || source,
            pSpan.conversationId
          );
        }

        // 3. Upsert Atomic Span
        db.prepare(`
          INSERT INTO atomic_spans (
            id, conversation_id, model_name, agent_name, raw_telemetry_id, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            model_name = excluded.model_name,
            agent_name = excluded.agent_name,
            raw_telemetry_id = excluded.raw_telemetry_id,
            input_tokens = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            cache_read_tokens = excluded.cache_read_tokens,
            cache_write_tokens = excluded.cache_write_tokens,
            reasoning_tokens = excluded.reasoning_tokens,
            created_at = excluded.created_at
        `).run(
          pSpan.spanId,
          pSpan.conversationId,
          pSpan.modelName,
          pSpan.agentName,
          rawId,
          pSpan.inputTokens,
          pSpan.outputTokens,
          pSpan.cacheReadTokens,
          pSpan.cacheWriteTokens,
          pSpan.reasoningTokens,
          pSpan.createdAt
        );
      }
    })();

    logger.debug({ rawId }, 'Finished parsing and populating DB tables asynchronously');
  } catch (err) {
    logger.error({ err, rawId }, 'Failed to process telemetry in background');
  }
}
