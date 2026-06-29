import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Server } from 'http';

// Configure environment variables before importing app modules
process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

// Dynamically import to apply env configurations
const { default: app } = await import('../index.js');
const { db } = await import('../db/database.js');

describe('OTLP Ingestion Endpoint & DB Setup', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    return new Promise<void>((resolve) => {
      // Start express server on dynamic port
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

  it('GET /healthz returns 200 OK', async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
    expect(data.uptime).toBeTypeOf('number');
  });

  it('POST /v1/traces persists valid telemetry payload and extracts conversation ID', async () => {
    // A sample trace payload imitating the OTel JSON format containing conversation.id
    const payload = {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  name: 'chat',
                  attributes: [
                    {
                      key: 'gen_ai.conversation.id',
                      value: { stringValue: 'test-conv-123' }
                    }
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('ok');
    expect(data.id).toBeTypeOf('number');

    // Verify database row
    const row = db.prepare('SELECT * FROM raw_telemetry WHERE id = ?').get(data.id) as any;
    expect(row).toBeDefined();
    expect(row.conversation_id).toBe('test-conv-123');
    
    const parsedPayload = JSON.parse(row.payload);
    expect(parsedPayload).toEqual(payload);
  });

  it('POST /v1/traces rejects unsupported Content-Type with 415', async () => {
    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: 'plain text data'
    });

    expect(res.status).toBe(415);
    const data = await res.json() as any;
    expect(data.error).toContain('Unsupported Media Type');
  });

  it('POST /v1/traces rejects payload larger than 50MB with 413', async () => {
    // Generate a payload slightly larger than 50MB (51MB of characters)
    const largeStr = 'a'.repeat(51 * 1024 * 1024);
    const largePayload = JSON.stringify({ data: largeStr });

    const res = await fetch(`${baseUrl}/v1/traces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: largePayload
    });

    expect(res.status).toBe(413);
  });
});
