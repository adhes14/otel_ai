import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Server } from 'http';

process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../index.js');
const { db } = await import('../db/database.js');

describe('Database Maintenance Endpoints', () => {
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

  it('DELETE /api/maintenance/clear-no-tokens removes empty telemetry and empty conversations', async () => {
    // Clear relevant tables before test
    db.prepare('DELETE FROM raw_telemetry').run();
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();

    // 1. Ingest a telemetry payload with a chat span that has 0 tokens
    const payloadNoTokens = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'span-empty',
                  name: 'chat',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-empty' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 0 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 0 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    // 2. Ingest a telemetry payload with a chat span that HAS tokens
    const payloadWithTokens = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  spanId: 'span-with-tokens',
                  name: 'chat',
                  attributes: [
                    { key: 'copilot_chat.chat_session_id', value: { stringValue: 'conv-active' } },
                    { key: 'gen_ai.response.model', value: { stringValue: 'gpt-4o' } },
                    { key: 'gen_ai.usage.input_tokens', value: { intValue: 150 } },
                    { key: 'gen_ai.usage.output_tokens', value: { intValue: 200 } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    // Post both traces
    const resNo = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadNoTokens)
    });
    const dataNo = await resNo.json() as any;
    const rawNoId = dataNo.id;

    const resWith = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadWithTokens)
    });
    const dataWith = await resWith.json() as any;
    const rawWithId = dataWith.id;

    // Wait for the asynchronous background processor (setImmediate) to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify they exist in DB before clearing
    const rawNoRowBefore = db.prepare('SELECT * FROM raw_telemetry WHERE id = ?').get(rawNoId);
    expect(rawNoRowBefore).toBeDefined();

    const rawWithRowBefore = db.prepare('SELECT * FROM raw_telemetry WHERE id = ?').get(rawWithId);
    expect(rawWithRowBefore).toBeDefined();

    // Call clear endpoint
    const resClear = await fetch(`${baseUrl}/api/maintenance/clear-no-tokens`, {
      method: 'DELETE'
    });
    expect(resClear.status).toBe(200);

    const clearResult = await resClear.json() as any;
    expect(clearResult.deleted_raw_count).toBeGreaterThanOrEqual(1);
    expect(clearResult.deleted_spans_count).toBeGreaterThanOrEqual(1);
    expect(clearResult.deleted_conversations_count).toBeGreaterThanOrEqual(1);

    // Verify empty telemetry, span, and conversation are deleted
    const rawNoRowAfter = db.prepare('SELECT * FROM raw_telemetry WHERE id = ?').get(rawNoId);
    expect(rawNoRowAfter).toBeUndefined();

    const spanNoRowAfter = db.prepare("SELECT * FROM atomic_spans WHERE id = 'span-empty'").get();
    expect(spanNoRowAfter).toBeUndefined();

    const convNoRowAfter = db.prepare("SELECT * FROM conversations WHERE id = 'conv-empty'").get();
    expect(convNoRowAfter).toBeUndefined();

    // Verify active telemetry, span, and conversation are NOT deleted
    const rawWithRowAfter = db.prepare('SELECT * FROM raw_telemetry WHERE id = ?').get(rawWithId);
    expect(rawWithRowAfter).toBeDefined();

    const spanWithRowAfter = db.prepare("SELECT * FROM atomic_spans WHERE id = 'span-with-tokens'").get();
    expect(spanWithRowAfter).toBeDefined();

    const convWithRowAfter = db.prepare("SELECT * FROM conversations WHERE id = 'conv-active'").get();
    expect(convWithRowAfter).toBeDefined();
  });
});
