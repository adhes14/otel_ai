import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Server } from 'http';

process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../index.js');
const { db } = await import('../db/database.js');

describe('Conversations and Spans Query API', () => {
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

  it('verifies paginated conversation listings, details with costs, and span queries', async () => {
    // Clear and seed test database
    db.prepare('DELETE FROM atomic_spans').run();
    db.prepare('DELETE FROM conversations').run();
    db.prepare('DELETE FROM model_costs').run();

    // 1. Seed models
    db.prepare('INSERT INTO model_costs (model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m) VALUES (?, ?, ?, ?, ?, ?)').run(
      'gpt-4o', 10, 20, 5, 5, 15
    );
    db.prepare('INSERT INTO model_costs (model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m) VALUES (?, ?, ?, ?, ?, ?)').run(
      'claude-3-5', 15, 30, 8, 8, 25
    );

    // 2. Seed conversations (older first, newer last)
    db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)').run('conv-1', 'Title 1', 1700000000, 1700001000);
    db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)').run('conv-2', 'Title 2', 1700002000, 1700003000);
    db.prepare('INSERT INTO conversations (id, title, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)').run('conv-3', null, 1700004000, 1700005000);

    // 3. Seed atomic spans
    // conv-1 spans
    db.prepare('INSERT INTO atomic_spans (id, conversation_id, model_name, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'span-1a', 'conv-1', 'gpt-4o', 100000, 50000, 20000, 10000, 5000, 1700000500
    );
    db.prepare('INSERT INTO atomic_spans (id, conversation_id, model_name, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'span-1b', 'conv-1', 'claude-3-5', 200000, 100000, 40000, 20000, 10000, 1700000800
    );

    // conv-2 spans
    db.prepare('INSERT INTO atomic_spans (id, conversation_id, model_name, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'span-2a', 'conv-2', 'gpt-4o', 50000, 20000, 10000, 5000, 2000, 1700002500
    );

    // Test GET /api/conversations (unpaginated/limit 2) - should return newest first (conv-3, conv-2)
    const listRes1 = await fetch(`${baseUrl}/api/conversations?limit=2`);
    expect(listRes1.status).toBe(200);
    const data1 = await listRes1.json() as any;
    expect(data1.conversations.length).toBe(2);
    expect(data1.conversations[0].id).toBe('conv-3');
    expect(data1.conversations[0].title).toBeNull();
    expect(data1.conversations[0].models).toEqual([]); // no spans for conv-3
    expect(data1.conversations[1].id).toBe('conv-2');
    expect(data1.conversations[1].title).toBe('Title 2');
    expect(data1.conversations[1].models).toEqual(['gpt-4o']);
    expect(data1.next_cursor).toBeTypeOf('string');

    // Test GET /api/conversations with cursor (second page) - should return conv-1
    const listRes2 = await fetch(`${baseUrl}/api/conversations?limit=2&cursor=${data1.next_cursor}`);
    expect(listRes2.status).toBe(200);
    const data2 = await listRes2.json() as any;
    expect(data2.conversations.length).toBe(1);
    expect(data2.conversations[0].id).toBe('conv-1');
    expect(data2.conversations[0].title).toBe('Title 1');
    expect(data2.conversations[0].models.sort()).toEqual(['claude-3-5', 'gpt-4o'].sort());
    expect(data2.next_cursor).toBeNull();

    // Test GET /api/conversations/:id (Detail & aggregate costs)
    const detailRes = await fetch(`${baseUrl}/api/conversations/conv-1`);
    expect(detailRes.status).toBe(200);
    const detailData = await detailRes.json() as any;
    expect(detailData.id).toBe('conv-1');
    expect(detailData.title).toBe('Title 1');
    expect(detailData.first_seen_at).toBe(1700000000);
    expect(detailData.last_seen_at).toBe(1700001000);
    expect(detailData.model_breakdown.length).toBe(2);

    // Verify detailed cost calculations for gpt-4o
    // input = 100,000 * 10 = $1.00
    // output = 50,000 * 20 = $1.00
    // cache = 20,000 * 5 = $0.10
    // reasoning = 5000 * 15 = $0.075
    // total = 1.00 + 1.00 + 0.10 + 0.075 = $2.175
    const gptAgg = detailData.model_breakdown.find((m: any) => m.model_name === 'gpt-4o');
    expect(gptAgg).toBeDefined();
    expect(gptAgg.input_tokens).toBe(100000);
    expect(gptAgg.output_tokens).toBe(50000);
    expect(gptAgg.cache_read_tokens).toBe(20000);
    expect(gptAgg.cache_write_tokens).toBe(10000);
    expect(gptAgg.reasoning_tokens).toBe(5000);
    expect(gptAgg.costs.input_cost).toBe(1.0);
    expect(gptAgg.costs.output_cost).toBe(1.0);
    expect(gptAgg.costs.cache_read_cost).toBe(0.1);
    expect(gptAgg.costs.cache_write_cost).toBe(0.05);
    expect(gptAgg.costs.reasoning_cost).toBe(0.075);
    expect(gptAgg.costs.total_cost).toBe(2.225);

    // Test GET /api/conversations/:id (Non-existent detail)
    const missingDetailRes = await fetch(`${baseUrl}/api/conversations/conv-missing`);
    expect(missingDetailRes.status).toBe(404);

    // Test GET /api/conversations/:id/spans
    const spansRes = await fetch(`${baseUrl}/api/conversations/conv-1/spans`);
    expect(spansRes.status).toBe(200);
    const spansList = await spansRes.json() as any[];
    expect(spansList.length).toBe(2);
    expect(spansList[0].id).toBe('span-1a');
    expect(spansList[1].id).toBe('span-1b');

    // Test GET /api/conversations/:id/spans (Non-existent conversation)
    const missingSpansRes = await fetch(`${baseUrl}/api/conversations/conv-missing/spans`);
    expect(missingSpansRes.status).toBe(404);
  });
});
