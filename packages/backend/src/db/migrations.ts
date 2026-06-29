import { db } from './database.js';
import logger from '../utils/logger.js';

export function runMigrations() {
  logger.info('Running database migrations...');

  db.transaction(() => {
    // 1. Raw Telemetry Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS raw_telemetry (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // 2. Model Costs Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS model_costs (
        model_name TEXT PRIMARY KEY,
        input_cost_per_m REAL NOT NULL DEFAULT 0,
        output_cost_per_m REAL NOT NULL DEFAULT 0,
        cache_cost_per_m REAL NOT NULL DEFAULT 0,
        reasoning_cost_per_m REAL NOT NULL DEFAULT 0
      );
    `).run();

    // 3. Processed Conversations Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `).run();

    // 4. Atomic Spans Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS atomic_spans (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (model_name) REFERENCES model_costs(model_name)
      );
    `).run();
  })();

  logger.info('Database migrations completed successfully.');
}
