import { db } from '../db/database.js';
import logger from '../utils/logger.js';

function getAttributeValue(attr: any): any {
  if (!attr || attr.value === undefined || attr.value === null) return null;
  const val = attr.value;
  if (typeof val !== 'object') {
    return val;
  }
  if ('stringValue' in val) return val.stringValue;
  if ('intValue' in val) return Number(val.intValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('boolValue' in val) return val.boolValue;
  if ('value' in val) return val.value;
  return null;
}

function findAttribute(attributes: any[] | undefined, key: string): any {
  const attr = attributes?.find?.(a => a.key === key);
  return attr ? getAttributeValue(attr) : null;
}

function extractPromptFromRequest(userReqStr: string): string | null {
  if (!userReqStr) return null;
  let text = userReqStr.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const item = parsed.find(i => i.type === 'input_text' && typeof i.text === 'string');
      if (item) text = item.text;
    }
  } catch {}

  const match = text.match(/<userRequest>([\s\S]*?)<\/userRequest>/i);
  let prompt = (match ? match[1] : text)
    .replace(/\\n/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (prompt.length > 60) {
    prompt = prompt.slice(0, 57) + '...';
  }
  return prompt || null;
}

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
      // Pre-scan all spans to build a map of traceId -> chatSessionId and subagentAliasMap
      const traceSessionMap = new Map<string, string>();
      const subagentAliasMap = new Map<string, string>();
      
      for (const span of spans) {
        const traceId = span.traceId;
        if (!traceId) continue;
        
        const chatSessionId = findAttribute(span.attributes, 'copilot_chat.chat_session_id');
        const sessionId = findAttribute(span.attributes, 'copilot_chat.session_id');
        const genAiConvId = findAttribute(span.attributes, 'gen_ai.conversation.id');
        const parentChatSessionId = findAttribute(span.attributes, 'copilot_chat.parent_chat_session_id');

        // If a span defines parent session_id / parent_chat_session_id
        // and a different chat_session_id for the subagent, track the mapping
        const parentSessionId = parentChatSessionId || sessionId;
        if (parentSessionId && chatSessionId && parentSessionId !== chatSessionId) {
          subagentAliasMap.set(chatSessionId, parentSessionId);
        }
        
        let resolvedSessionId = chatSessionId || sessionId;
        if (!resolvedSessionId && (span.name === 'invoke_agent' || span.name?.startsWith('invoke_agent '))) {
          resolvedSessionId = genAiConvId;
        }
        
        if (resolvedSessionId) {
          const existing = traceSessionMap.get(traceId);
          // Prefer non-subagent session IDs if they exist
          if (!existing || (existing.startsWith('toolu_') && !resolvedSessionId.startsWith('toolu_'))) {
            traceSessionMap.set(traceId, resolvedSessionId);
          }
        }
      }

      for (const span of spans) {
        // Target only leaf nodes representing LLM chat interactions (e.g. "chat" or "chat <model_name>")
        if (span.name !== 'chat' && !span.name.startsWith('chat ')) continue;

        let conversationId = findAttribute(span.attributes, 'copilot_chat.chat_session_id') ||
                             findAttribute(span.attributes, 'copilot_chat.session_id');
        
        if (!conversationId && span.traceId) {
          conversationId = traceSessionMap.get(span.traceId);
        }
        
        // Resolve alias if it is a subagent session ID
        if (conversationId && subagentAliasMap.has(conversationId)) {
          conversationId = subagentAliasMap.get(conversationId);
        }

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
          db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)').run(
            conversationId,
            fallbackTitle || null,
            spanTimeSec,
            spanTimeSec
          );
        } else {
          db.prepare('UPDATE conversations SET title = ?, first_seen_at = ?, last_seen_at = ? WHERE id = ?').run(
            existingConv.title || fallbackTitle || null,
            Math.min(existingConv.first_seen_at, spanTimeSec),
            Math.max(existingConv.last_seen_at, spanTimeSec),
            conversationId
          );
        }

        // 3. Upsert Atomic Span
        db.prepare(`
          INSERT INTO atomic_spans (
            id, conversation_id, model_name, agent_name, input_tokens, output_tokens,
            cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            conversation_id = excluded.conversation_id,
            model_name = excluded.model_name,
            agent_name = excluded.agent_name,
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
