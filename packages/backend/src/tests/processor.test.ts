import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Server } from 'http';

process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../index.js');
const { db } = await import('../db/database.js');

describe('Telemetry Processing Engine', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    db.close();
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('correctly processes OTel trace payload, parses chat spans, auto-discovers model, and updates tables', async () => {
    // Clear relevant tables before test
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM model_costs WHERE model_name = ?').run('gpt-4o-discovered');

    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'chat-span-1',
                  name: 'chat gpt-4o-discovered',
                  startTimeUnixNano: '1719619200000000000', // unix epoch 1719619200
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-discovered-123' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o-discovered' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 1200 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 500 } },
                    { key: 'gen_ai.usage.cache_read.input_tokens', value: { intValue: 300 } },
                    { key: 'gen_ai.usage.cache_creation.input_tokens', value: { intValue: 150 } },
                    { key: 'gen_ai.usage.reasoning_tokens', value: { intValue: 100 } },
                    { key: 'copilot_chat.user_request', value: { stringValue: '[{"type":"input_text","text":"<userRequest>Hello my friendly assistant!</userRequest>"}]' } }
                  ]
                },
                {
                  spanId: 'ignore-span-2',
                  name: 'invoke_agent', // Should be ignored because name is not 'chat'
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-discovered-123' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Yield/Wait for async background parser to run
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify conversation was created
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-discovered-123') as any;
    expect(conversation).toBeDefined();
    expect(conversation.first_seen_at).toBe(1719619200);
    expect(conversation.last_seen_at).toBe(1719619200);
    expect(conversation.title).toBe('Hello my friendly assistant!');

    // Verify model cost entry was auto-discovered with $0 rates
    const modelCost = db.prepare('SELECT * FROM model_costs WHERE model_name = ?').get('gpt-4o-discovered') as any;
    expect(modelCost).toBeDefined();
    expect(modelCost.input_cost_per_m).toBe(0);
    expect(modelCost.output_cost_per_m).toBe(0);
    expect(modelCost.cache_read_cost_per_m).toBe(0);
    expect(modelCost.cache_write_cost_per_m).toBe(0);
    expect(modelCost.reasoning_cost_per_m).toBe(0);

    // Verify atomic span was inserted correctly
    const span = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-span-1') as any;
    expect(span).toBeDefined();
    expect(span.conversation_id).toBe('conv-discovered-123');
    expect(span.model_name).toBe('gpt-4o-discovered');
    expect(span.input_tokens).toBe(1200);
    expect(span.output_tokens).toBe(500);
    expect(span.cache_read_tokens).toBe(300);
    expect(span.cache_write_tokens).toBe(150);
    expect(span.reasoning_tokens).toBe(100);
    expect(span.created_at).toBe(1719619200);

    // Verify that the ignore-span-2 was NOT inserted
    const ignoredSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('ignore-span-2');
    expect(ignoredSpan).toBeUndefined();
  });

  it('is idempotent on duplicate span insertion (upsert behavior)', async () => {
    // Send same span again but with updated tokens
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'chat-span-1',
                  name: 'chat gpt-4o-discovered',
                  startTimeUnixNano: '1719619205000000000', // 5 seconds later
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-discovered-123' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o-discovered' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 2000 } }, // updated
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 800 } }  // updated
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Wait for background parsing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify conversation last_seen_at was updated
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-discovered-123') as any;
    expect(conversation.first_seen_at).toBe(1719619200); // kept original min
    expect(conversation.last_seen_at).toBe(1719619205);  // updated to new max

    // Verify atomic span row was updated (not duplicated)
    const spans = db.prepare('SELECT * FROM atomic_spans WHERE conversation_id = ?').all('conv-discovered-123');
    expect(spans.length).toBe(1);
 
    const span = spans[0] as any;
    expect(span.id).toBe('chat-span-1');
    expect(span.input_tokens).toBe(2000);
    expect(span.output_tokens).toBe(800);
    expect(span.created_at).toBe(1719619205);
  });

  it('skips trace spans that do not have copilot_chat.chat_session_id or copilot_chat.session_id', async () => {
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'chat-skipped-span',
                  name: 'chat gpt-4o-discovered',
                  startTimeUnixNano: '1719619210000000000',
                  attributes: [
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o-discovered' } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'Please write a brief title for the following request:\n\nHello' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Wait for background parsing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify no atomic span or conversation was created
    const span = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-skipped-span');
    expect(span).toBeUndefined();
  });

  it('correctly processes spans using copilot_chat.session_id as a fallback grouping key', async () => {
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'chat-span-fallback',
                  name: 'chat gpt-4o-discovered',
                  startTimeUnixNano: '1719619220000000000',
                  attributes: [
                    { key: 'copilot_chat.session_id', value: { stringValue: 'conv-fallback-456' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o-discovered' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 500 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 200 } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'Using fallback session ID' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Wait for background parsing
    await new Promise(resolve => setTimeout(resolve, 50));

    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-fallback-456') as any;
    expect(conversation).toBeDefined();
    expect(conversation.title).toBe('Using fallback session ID');

    const span = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-span-fallback') as any;
    expect(span).toBeDefined();
    expect(span.conversation_id).toBe('conv-fallback-456');
  });

  it('groups chat spans without direct session ID attributes if they share a traceId with an invoke_agent span containing the session ID', async () => {
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-shared-12345',
                  spanId: 'chat-byok-span',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619230000000000',
                  attributes: [
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 300 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 150 } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'BYOK test prompt' } }
                  ]
                },
                {
                  traceId: 'trace-shared-12345',
                  spanId: 'invoke-parent-span',
                  name: 'invoke_agent GitHub Copilot Chat',
                  startTimeUnixNano: '1719619230000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-byok-session-789' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Wait for background parsing
    await new Promise(resolve => setTimeout(resolve, 50));

    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-byok-session-789') as any;
    expect(conversation).toBeDefined();
    expect(conversation.title).toBe('BYOK test prompt');

    const span = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-byok-span') as any;
    expect(span).toBeDefined();
    expect(span.conversation_id).toBe('conv-byok-session-789');
    expect(span.model_name).toBe('models/gemini-2.5-flash');
  });

  it('correctly maps subagent session IDs to the parent conversation session and trims titles containing raw/escaped newlines', async () => {
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-subagent-123',
                  spanId: 'chat-main-span',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619240000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-main-parent' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'copilot_chat.user_request', value: { stringValue: '\\nstart\\n' } }
                  ]
                },
                {
                  traceId: 'trace-subagent-123',
                  spanId: 'invoke-subagent-span',
                  name: 'invoke_agent player',
                  startTimeUnixNano: '1719619241000000000',
                  attributes: [
                    { key: 'copilot_chat.session_id', value: { stringValue: 'conv-main-parent' } },
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'toolu_subagent_xyz' } }
                  ]
                },
                {
                  traceId: 'trace-subagent-123',
                  spanId: 'chat-subagent-span',
                  name: 'chat Kimi-K2.6',
                  startTimeUnixNano: '1719619242000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'toolu_subagent_xyz' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'Kimi-K2.6' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 100 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);

    // Wait for background parsing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify main conversation exists, is NOT toolu_subagent_xyz, and its title is trimmed
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-main-parent') as any;
    expect(conversation).toBeDefined();
    expect(conversation.title).toBe('start'); // should trim backslash-n and newlines

    // Verify the subagent chat span is mapped to 'conv-main-parent', NOT 'toolu_subagent_xyz'
    const mainSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-main-span') as any;
    expect(mainSpan).toBeDefined();
    expect(mainSpan.conversation_id).toBe('conv-main-parent');

    const subagentSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('chat-subagent-span') as any;
    expect(subagentSpan).toBeDefined();
    expect(subagentSpan.conversation_id).toBe('conv-main-parent');

    // Verify that NO conversation is created for the toolu ID itself
    const missingConv = db.prepare('SELECT * FROM conversations WHERE id = ?').get('toolu_subagent_xyz');
    expect(missingConv).toBeUndefined();
  });
});

