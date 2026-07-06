import { db } from '../db/database.js';
import logger from '../utils/logger.js';
import { findAttribute, extractPromptFromRequest } from './telemetry/helpers.js';
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

      // Pre-scan all spans to build a map of traceId -> chatSessionId and subagentAliasMap
      const traceSessionMap = new Map<string, string>();
      const subagentAliasMap = new Map<string, string>();
      resolver.preScanSpans(spans, traceSessionMap, subagentAliasMap);

      for (const span of spans) {
        // Target only leaf nodes representing LLM chat interactions (e.g. "chat" or "chat <model_name>")
        if (span.name !== 'chat' && !span.name.startsWith('chat ')) continue;

        let conversationId = resolver.resolveConversationId(span, traceSessionMap, subagentAliasMap);

        // Skip spans that do not belong to a real user conversation/session (e.g. system/agent utility calls)
        if (!conversationId) continue;

        const spanId = span.spanId || span.span_id || `gen-${Math.random().toString(36).substring(2, 11)}`;
        
        const modelName = findAttribute(span.attributes, 'gen_ai.response.model') || 
                          findAttribute(span.attributes, 'gen_ai.request.model') || 
                          'unknown-model';

        const agentName = findAttribute(span.attributes, 'gen_ai.agent.name');

        const inputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.input_tokens') ?? 0);
        const outputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.output_tokens') ?? 0);
        const cacheReadTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_read.input_tokens') ?? 0);
        const cacheWriteTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_creation.input_tokens') ?? 0);
        const reasoningTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.reasoning_tokens') ?? 0);

        // Extract user request & fallback title
        const userRequest = findAttribute(span.attributes, 'copilot_chat.user_request');
        let fallbackTitle: string | null = null;
        if (typeof userRequest === 'string') {
          fallbackTitle = extractPromptFromRequest(userRequest);
        }

        // Extract time
        const now = Math.floor(Date.now() / 1000);
        let spanTimeSec = now;
        const timeNano = span.startTimeUnixNano || span.start_time_unix_nano || span.timeUnixNano || span.time_unix_nano;
        if (timeNano) {
          try {
            spanTimeSec = Math.floor(Number(BigInt(timeNano) / 1000000000n));
          } catch {
            // If BigInt conversion fails, check if it's already a number or a simple string representing seconds
            const num = Number(timeNano);
            if (!isNaN(num)) {
              spanTimeSec = num > 1e11 ? Math.floor(num / 1000) : num;
            }
          }
        }

        // 1. Model Auto-Discovery: Hot insertion of model costs at $0.00
        db.prepare(`
          INSERT OR IGNORE INTO model_costs (
            model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m
          ) VALUES (?, 0, 0, 0, 0, 0)
        `).run(modelName);

        // 2. Upsert Conversation
        const existingConv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId) as any;
        if (!existingConv) {
          db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at, source) VALUES (?, ?, ?, ?, ?)').run(
            conversationId,
            fallbackTitle || null,
            spanTimeSec,
            spanTimeSec,
            source
          );
        } else {
          db.prepare('UPDATE conversations SET title = ?, first_seen_at = ?, last_seen_at = ?, source = ? WHERE id = ?').run(
            existingConv.title || fallbackTitle || null,
            Math.min(existingConv.first_seen_at, spanTimeSec),
            Math.max(existingConv.last_seen_at, spanTimeSec),
            existingConv.source || source,
            conversationId
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
          spanId,
          conversationId,
          modelName,
          agentName,
          rawId,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          reasoningTokens,
          spanTimeSec
        );
      }
    })();

    logger.debug({ rawId }, 'Finished parsing and populating DB tables asynchronously');
  } catch (err) {
    logger.error({ err, rawId }, 'Failed to process telemetry in background');
  }
}
