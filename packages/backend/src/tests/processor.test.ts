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
    expect(span.raw_telemetry_id).toBeGreaterThan(0);

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

  it('correctly extracts agent_name for orchestrators and subagents, and supports agent_name filtering in APIs', async () => {
    // Clear relevant tables
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();

    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-agent-test-123',
                  spanId: 'orchestrator-chat-span',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619240000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-agent-parent' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'gen_ai.agent.name', value: { stringValue: 'test-fixer' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 1000 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 500 } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'Parent agent query' } }
                  ]
                },
                {
                  traceId: 'trace-agent-test-123',
                  spanId: 'invoke-subagent-span',
                  name: 'invoke_agent test-executer',
                  startTimeUnixNano: '1719619241000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'toolu_subagent_abc' } },
                    { key: 'copilot_chat.parent_chat_session_id', value: { stringValue: 'conv-agent-parent' } },
                    { key: 'gen_ai.agent.name', value: { stringValue: 'test-executer' } }
                  ]
                },
                {
                  traceId: 'trace-agent-test-123',
                  spanId: 'subagent-chat-span',
                  name: 'chat Kimi-K2.6',
                  startTimeUnixNano: '1719619242000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'toolu_subagent_abc' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'Kimi-K2.6' } },
                    { key: 'gen_ai.agent.name', value: { stringValue: 'tool/runSubagent-test-executer' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 200 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 100 } }
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

    // Verify stored agent names in DB
    const orchestratorSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('orchestrator-chat-span') as any;
    expect(orchestratorSpan).toBeDefined();
    expect(orchestratorSpan.agent_name).toBe('test-fixer');

    const subagentSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('subagent-chat-span') as any;
    expect(subagentSpan).toBeDefined();
    expect(subagentSpan.agent_name).toBe('tool/runSubagent-test-executer');

    // Test API: GET /api/conversations list returns agents
    const listRes = await fetch(`${baseUrl}/api/conversations`);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    const convListItem = listBody.conversations.find((c: any) => c.id === 'conv-agent-parent');
    expect(convListItem).toBeDefined();
    expect(convListItem.agents).toContain('test-fixer');
    expect(convListItem.agents).toContain('tool/runSubagent-test-executer');

    // Test API: GET /api/conversations/:id/spans with agent_name filter
    const spansOrchRes = await fetch(`${baseUrl}/api/conversations/conv-agent-parent/spans?agent_name=test-fixer`);
    expect(spansOrchRes.status).toBe(200);
    const spansOrch = await spansOrchRes.json() as any[];
    expect(spansOrch.length).toBe(1);
    expect(spansOrch[0].id).toBe('orchestrator-chat-span');

    const spansSubRes = await fetch(`${baseUrl}/api/conversations/conv-agent-parent/spans?agent_name=tool/runSubagent-test-executer`);
    expect(spansSubRes.status).toBe(200);
    const spansSub = await spansSubRes.json() as any[];
    expect(spansSub.length).toBe(1);
    expect(spansSub[0].id).toBe('subagent-chat-span');

    // Test API: GET /api/conversations/:id detail with agent_name filter
    const detailSubRes = await fetch(`${baseUrl}/api/conversations/conv-agent-parent?agent_name=tool/runSubagent-test-executer`);
    expect(detailSubRes.status).toBe(200);
    const detailSub = await detailSubRes.json() as any;
    expect(detailSub.model_breakdown.length).toBe(1);
    expect(detailSub.model_breakdown[0].model_name).toBe('Kimi-K2.6');
    expect(detailSub.model_breakdown[0].input_tokens).toBe(200);
  });

  it('correctly regenerates conversations and atomic spans from raw_telemetry on POST /api/maintenance/reprocess', async () => {
    // 1. Clear tables
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();

    const testPayload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'reprocess-span-1',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619300000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-reprocess-123' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 500 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 250 } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'My test prompt before reprocess' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    // Store in raw_telemetry
    db.prepare('INSERT INTO raw_telemetry (id, conversation_id, payload, created_at) VALUES (?, ?, ?, ?)')
      .run(999, 'conv-reprocess-123', JSON.stringify(testPayload), Math.floor(Date.now() / 1000));

    // Initially verify tables are empty (conversations & atomic_spans should not have it yet)
    expect(db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-reprocess-123')).toBeUndefined();
    expect(db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('reprocess-span-1')).toBeUndefined();

    // Call reprocess endpoint
    const res = await fetch(`${baseUrl}/api/maintenance/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');

    // Verify conversation and span are now successfully regenerated and populated
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('conv-reprocess-123') as any;
    expect(conversation).toBeDefined();
    expect(conversation.title).toBe('My test prompt before reprocess');

    const span = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('reprocess-span-1') as any;
    expect(span).toBeDefined();
    expect(span.conversation_id).toBe('conv-reprocess-123');
    expect(span.model_name).toBe('models/gemini-2.5-flash');
    expect(span.input_tokens).toBe(500);
    expect(span.output_tokens).toBe(250);
  });

  it('does not map the stable copilot_chat.chat_session_id to transient gen_ai.conversation.id', async () => {
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();

    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-transient-test-456',
                  spanId: 'chat-span-1',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619240000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'stable-session-123' } },
                    { key: 'gen_ai.conversation.id', value: { stringValue: 'transient-id-abc' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'Request 1' } }
                  ]
                },
                {
                  traceId: 'trace-transient-test-456',
                  spanId: 'chat-span-2',
                  name: 'chat models/gemini-2.5-flash',
                  startTimeUnixNano: '1719619250000000000',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'stable-session-123' } },
                    { key: 'gen_ai.conversation.id', value: { stringValue: 'transient-id-def' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gemini-2.5-flash' } },
                    { key: 'copilot_chat.user_request', value: { stringValue: 'Request 2' } }
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

    // Verify both spans are grouped under 'stable-session-123', NOT the transient IDs
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get('stable-session-123') as any;
    expect(conversation).toBeDefined();

    const missingConv1 = db.prepare('SELECT * FROM conversations WHERE id = ?').get('transient-id-abc');
    expect(missingConv1).toBeUndefined();

    const missingConv2 = db.prepare('SELECT * FROM conversations WHERE id = ?').get('transient-id-def');
    expect(missingConv2).toBeUndefined();

    const spans = db.prepare('SELECT * FROM atomic_spans WHERE conversation_id = ?').all('stable-session-123');
    expect(spans.length).toBe(2);
  });

  it('correctly handles Copilot CLI subagents through strategy-based TelemetryResolver', async () => {
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'github-copilot' } }
            ]
          },
          scopeSpans: [
            {
              spans: [
                {
                  traceId: 'trace-copilot-cli-agent',
                  spanId: 'cli-orchestrator-chat',
                  name: 'chat models/gpt-4o',
                  startTimeUnixNano: '1719619300000000000',
                  attributes: [
                    { key: 'gen_ai.conversation.id', value: { stringValue: 'conv-cli-test' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gpt-4o' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 1000 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 500 } }
                  ]
                },
                {
                  traceId: 'trace-copilot-cli-agent',
                  spanId: 'cli-invoke-subagent',
                  name: 'invoke_agent cli-subagent',
                  startTimeUnixNano: '1719619301000000000',
                  attributes: [
                    { key: 'gen_ai.conversation.id', value: { stringValue: 'conv-cli-test' } },
                    { key: 'gen_ai.agent.name', value: { stringValue: 'cli-subagent' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 300 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 150 } },
                    { key: 'gen_ai.usage.reasoning.output_tokens', value: { intValue: 50 } }
                  ]
                },
                {
                  traceId: 'trace-copilot-cli-agent',
                  spanId: 'cli-subagent-chat-child',
                  name: 'chat models/gpt-4o',
                  startTimeUnixNano: '1719619302000000000',
                  parentSpanId: 'cli-invoke-subagent',
                  attributes: [
                    { key: 'gen_ai.conversation.id', value: { stringValue: 'conv-cli-test' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'models/gpt-4o' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 300 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 150 } }
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

    // Verify stored agent names in DB: orchestrator should be null, subagent should be 'cli-subagent'
    const orchestratorSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('cli-orchestrator-chat') as any;
    expect(orchestratorSpan).toBeDefined();
    expect(orchestratorSpan.agent_name).toBeNull();

    const subagentSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('cli-invoke-subagent') as any;
    expect(subagentSpan).toBeDefined();
    expect(subagentSpan.agent_name).toBe('cli-subagent');
    expect(subagentSpan.reasoning_tokens).toBe(50);

    // Verify that the child chat span was discarded
    const childSpan = db.prepare('SELECT * FROM atomic_spans WHERE id = ?').get('cli-subagent-chat-child');
    expect(childSpan).toBeUndefined();

    // Verify API format: GET /api/conversations should return agents with 'tool/runSubagent-' prefix and virtual 'orchestrator'
    const listRes = await fetch(`${baseUrl}/api/conversations`);
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as any;
    const convListItem = listBody.conversations.find((c: any) => c.id === 'conv-cli-test');
    expect(convListItem).toBeDefined();
    expect(convListItem.agents).toContain('tool/runSubagent-cli-subagent');
    expect(convListItem.agents).toContain('orchestrator');

    // Verify API filtering: GET /api/conversations/:id/spans?agent_name=tool/runSubagent-cli-subagent
    const spansSubRes = await fetch(`${baseUrl}/api/conversations/conv-cli-test/spans?agent_name=tool/runSubagent-cli-subagent`);
    expect(spansSubRes.status).toBe(200);
    const spansSub = await spansSubRes.json() as any[];
    expect(spansSub.length).toBe(1);
    expect(spansSub[0].id).toBe('cli-invoke-subagent');

    // Verify API filtering: GET /api/conversations/:id/spans?agent_name=orchestrator
    const spansOrchRes = await fetch(`${baseUrl}/api/conversations/conv-cli-test/spans?agent_name=orchestrator`);
    expect(spansOrchRes.status).toBe(200);
    const spansOrch = await spansOrchRes.json() as any[];
    expect(spansOrch.length).toBe(1);
    expect(spansOrch[0].id).toBe('cli-orchestrator-chat');
  });
});
