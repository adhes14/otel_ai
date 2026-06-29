import { db } from '../db/database.js';
import logger from '../utils/logger.js';

interface OTelAttribute {
  key: string;
  value: {
    stringValue?: string;
    intValue?: string | number;
    doubleValue?: number;
    boolValue?: boolean;
    [key: string]: any;
  } | string | number | boolean;
}

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

function findAttribute(attributes: any[], key: string): any {
  if (!attributes || !Array.isArray(attributes)) return null;
  const attr = attributes.find(a => a.key === key);
  return attr ? getAttributeValue(attr) : null;
}


function extractPromptFromRequest(userReqStr: string): string | null {
  if (!userReqStr) return null;
  let text = userReqStr.trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item.type === 'input_text' && typeof item.text === 'string') {
          text = item.text;
          break;
        }
      }
    }
  } catch (e) {}

  const match = text.match(/<userRequest>([\s\S]*?)<\/userRequest>/i);
  let prompt = match ? match[1].trim() : text.trim();
  
  prompt = prompt.replace(/\s+/g, ' ');
  if (prompt.length > 60) {
    prompt = prompt.substring(0, 57) + '...';
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

    db.transaction(() => {
      // Pre-scan all spans to build a map of traceId -> chatSessionId
      const traceSessionMap = new Map<string, string>();
      for (const resSpan of resourceSpans) {
        const scopeSpans = resSpan.scopeSpans;
        if (!scopeSpans || !Array.isArray(scopeSpans)) continue;
        for (const scopeSpan of scopeSpans) {
          const spans = scopeSpan.spans;
          if (!spans || !Array.isArray(spans)) continue;
          for (const span of spans) {
            const traceId = span.traceId;
            if (!traceId) continue;
            
            let sessionId = findAttribute(span.attributes, 'copilot_chat.chat_session_id') ||
                            findAttribute(span.attributes, 'copilot_chat.session_id');
                            
            if (!sessionId && (span.name === 'invoke_agent' || span.name?.startsWith('invoke_agent '))) {
              sessionId = findAttribute(span.attributes, 'gen_ai.conversation.id');
            }
            
            if (sessionId) {
              traceSessionMap.set(traceId, sessionId);
            }
          }
        }
      }

      for (const resSpan of resourceSpans) {
        const scopeSpans = resSpan.scopeSpans;
        if (!scopeSpans || !Array.isArray(scopeSpans)) continue;

        for (const scopeSpan of scopeSpans) {
          const spans = scopeSpan.spans;
          if (!spans || !Array.isArray(spans)) continue;

          for (const span of spans) {
            // Target only leaf nodes representing LLM chat interactions (e.g. "chat" or "chat <model_name>")
            if (span.name !== 'chat' && !span.name.startsWith('chat ')) continue;

            let conversationId = findAttribute(span.attributes, 'copilot_chat.chat_session_id') ||
                                 findAttribute(span.attributes, 'copilot_chat.session_id');
            
            if (!conversationId && span.traceId) {
              conversationId = traceSessionMap.get(span.traceId);
            }
            
            // Skip spans that do not belong to a real user conversation/session (e.g. system/agent utility calls)
            if (!conversationId) continue;

            const spanId = span.spanId || span.span_id || `gen-${Math.random().toString(36).substring(2, 11)}`;
            
            const modelName = findAttribute(span.attributes, 'gen_ai.response.model') || 
                              findAttribute(span.attributes, 'gen_ai.request.model') || 
                              'unknown-model';

            const inputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.input_tokens') ?? 0);
            const outputTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.output_tokens') ?? 0);
            const cacheReadTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_read.input_tokens') ?? 0);
            const cacheWriteTokens = Number(findAttribute(span.attributes, 'gen_ai.usage.cache_write.input_tokens') ?? 0);
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
              } catch (e) {
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
                model_name, input_cost_per_m, output_cost_per_m, cache_cost_per_m, reasoning_cost_per_m
              ) VALUES (?, 0, 0, 0, 0)
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
              const newFirst = Math.min(existingConv.first_seen_at, spanTimeSec);
              const newLast = Math.max(existingConv.last_seen_at, spanTimeSec);
              
              let titleToSave = existingConv.title;
              if (!titleToSave && fallbackTitle) {
                titleToSave = fallbackTitle;
              }

              db.prepare('UPDATE conversations SET title = ?, first_seen_at = ?, last_seen_at = ? WHERE id = ?').run(
                titleToSave,
                newFirst,
                newLast,
                conversationId
              );
            }

            // 3. Upsert Atomic Span
            db.prepare(`
              INSERT INTO atomic_spans (
                id, conversation_id, model_name, input_tokens, output_tokens,
                cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                conversation_id = excluded.conversation_id,
                model_name = excluded.model_name,
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
              inputTokens,
              outputTokens,
              cacheReadTokens,
              cacheWriteTokens,
              reasoningTokens,
              spanTimeSec
            );
          }
        }
      }
    })();

    logger.debug({ rawId }, 'Finished parsing and populating DB tables asynchronously');
  } catch (err) {
    logger.error({ err, rawId }, 'Failed to process telemetry in background');
  }
}
