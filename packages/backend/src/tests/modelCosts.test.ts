import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Server } from 'http';

process.env.DB_PATH = ':memory:';
process.env.LOG_LEVEL = 'silent';
process.env.NODE_ENV = 'test';

const { default: app } = await import('../index.js');
const { db } = await import('../db/database.js');

describe('Model Costs CRUD API', () => {
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

  it('handles full lifecycle of model costs CRUD operations', async () => {
    // Clear the table first
    db.prepare('DELETE FROM model_costs').run();

    // 1. GET /api/model-costs (Empty list initially)
    let getRes = await fetch(`${baseUrl}/api/model-costs`);
    expect(getRes.status).toBe(200);
    let list = await getRes.json() as any[];
    expect(list.length).toBe(0);

    // 2. POST /api/model-costs (Create gpt-4o)
    const newModel = {
      model_name: 'gpt-4o',
      input_cost_per_m: 5.0,
      output_cost_per_m: 15.0,
      cache_read_cost_per_m: 2.5,
      cache_write_cost_per_m: 2.0,
      reasoning_cost_per_m: 10.0
    };

    let postRes = await fetch(`${baseUrl}/api/model-costs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newModel)
    });
    expect(postRes.status).toBe(201);
    let postData = await postRes.json() as any;
    expect(postData.status).toBe('created');
    expect(postData.model_name).toBe('gpt-4o');

    // 3. POST /api/model-costs (Duplicate rejection)
    let dupRes = await fetch(`${baseUrl}/api/model-costs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newModel)
    });
    expect(dupRes.status).toBe(409);
    let dupData = await dupRes.json() as any;
    expect(dupData.error).toContain('already exists');

    // 4. GET /api/model-costs (List containing gpt-4o)
    getRes = await fetch(`${baseUrl}/api/model-costs`);
    expect(getRes.status).toBe(200);
    list = await getRes.json() as any[];
    expect(list.length).toBe(1);
    expect(list[0].model_name).toBe('gpt-4o');
    expect(list[0].input_cost_per_m).toBe(5.0);

    // 5. PUT /api/model-costs/:modelName (Update gpt-4o rates)
    const updatedRates = {
      input_cost_per_m: 2.5,
      output_cost_per_m: 10.0,
      cache_read_cost_per_m: 1.25,
      cache_write_cost_per_m: 1.0,
      reasoning_cost_per_m: 8.0
    };

    let putRes = await fetch(`${baseUrl}/api/model-costs/gpt-4o`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRates)
    });
    expect(putRes.status).toBe(200);
    let putData = await putRes.json() as any;
    expect(putData.status).toBe('updated');
    expect(putData.model_name).toBe('gpt-4o');

    // Verify update
    const dbRow = db.prepare('SELECT * FROM model_costs WHERE model_name = ?').get('gpt-4o') as any;
    expect(dbRow.input_cost_per_m).toBe(2.5);
    expect(dbRow.output_cost_per_m).toBe(10.0);

    // 6. PUT /api/model-costs/:modelName (Non-existent model)
    let putMissingRes = await fetch(`${baseUrl}/api/model-costs/claude-3`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedRates)
    });
    expect(putMissingRes.status).toBe(404);

    // 7. DELETE /api/model-costs/:modelName (Delete gpt-4o)
    let delRes = await fetch(`${baseUrl}/api/model-costs/gpt-4o`, {
      method: 'DELETE'
    });
    expect(delRes.status).toBe(200);
    let delData = await delRes.json() as any;
    expect(delData.status).toBe('deleted');

    // Verify deletion
    const finalGet = await fetch(`${baseUrl}/api/model-costs`);
    const finalList = await finalGet.json() as any[];
    expect(finalList.length).toBe(0);

    // 8. DELETE /api/model-costs/:modelName (Non-existent model)
    let delMissingRes = await fetch(`${baseUrl}/api/model-costs/gpt-4o`, {
      method: 'DELETE'
    });
    expect(delMissingRes.status).toBe(404);
  });
});
