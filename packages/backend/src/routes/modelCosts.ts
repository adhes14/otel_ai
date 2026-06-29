import { Router, Request, Response } from 'express';
import { db } from '../db/database.js';
import logger from '../utils/logger.js';

const router = Router();

// GET /api/model-costs - List all model costs
router.get('/api/model-costs', (req: Request, res: Response) => {
  try {
    const rows = db.prepare('SELECT * FROM model_costs ORDER BY model_name ASC').all();
    return res.status(200).json(rows);
  } catch (err) {
    logger.error({ err }, 'Failed to fetch model costs');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/model-costs - Create a new model cost entry
router.post('/api/model-costs', (req: Request, res: Response) => {
  const { model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m } = req.body;

  if (!model_name || typeof model_name !== 'string' || model_name.trim() === '') {
    return res.status(400).json({ error: 'model_name is required and must be a non-empty string' });
  }

  try {
    const existing = db.prepare('SELECT 1 FROM model_costs WHERE model_name = ?').get(model_name);
    if (existing) {
      return res.status(409).json({ error: `Model cost rate for "${model_name}" already exists` });
    }

    db.prepare(`
      INSERT INTO model_costs (model_name, input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      model_name,
      Number(input_cost_per_m ?? 0),
      Number(output_cost_per_m ?? 0),
      Number(cache_read_cost_per_m ?? 0),
      Number(cache_write_cost_per_m ?? 0),
      Number(reasoning_cost_per_m ?? 0)
    );

    return res.status(201).json({
      status: 'created',
      model_name
    });
  } catch (err) {
    logger.error({ err, model_name }, 'Failed to create model cost entry');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT /api/model-costs/:modelName - Update an existing model cost entry
router.put('/api/model-costs/:modelName', (req: Request, res: Response) => {
  const { modelName } = req.params;
  const { input_cost_per_m, output_cost_per_m, cache_read_cost_per_m, cache_write_cost_per_m, reasoning_cost_per_m } = req.body;

  try {
    const existing = db.prepare('SELECT 1 FROM model_costs WHERE model_name = ?').get(modelName);
    if (!existing) {
      return res.status(404).json({ error: `Model "${modelName}" not found` });
    }

    db.prepare(`
      UPDATE model_costs
      SET input_cost_per_m = ?, output_cost_per_m = ?, cache_read_cost_per_m = ?, cache_write_cost_per_m = ?, reasoning_cost_per_m = ?
      WHERE model_name = ?
    `).run(
      Number(input_cost_per_m ?? 0),
      Number(output_cost_per_m ?? 0),
      Number(cache_read_cost_per_m ?? 0),
      Number(cache_write_cost_per_m ?? 0),
      Number(reasoning_cost_per_m ?? 0),
      modelName
    );

    return res.status(200).json({
      status: 'updated',
      model_name: modelName
    });
  } catch (err) {
    logger.error({ err, modelName }, 'Failed to update model cost entry');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// DELETE /api/model-costs/:modelName - Delete a model cost entry
router.delete('/api/model-costs/:modelName', (req: Request, res: Response) => {
  const { modelName } = req.params;

  try {
    const existing = db.prepare('SELECT 1 FROM model_costs WHERE model_name = ?').get(modelName);
    if (!existing) {
      return res.status(404).json({ error: `Model "${modelName}" not found` });
    }

    db.prepare('DELETE FROM model_costs WHERE model_name = ?').run(modelName);

    return res.status(200).json({
      status: 'deleted',
      model_name: modelName
    });
  } catch (err) {
    logger.error({ err, modelName }, 'Failed to delete model cost entry');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
