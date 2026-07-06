import { db } from './database.js';
import logger from '../utils/logger.js';

export function runMigrations() {
  logger.info('Running database migrations...');

  // Check if we need to drop old tables to migrate schema
  let needsMigration = false;
  try {
    const infoSpans = db.pragma("table_info(atomic_spans)") as any[];
    if (infoSpans && infoSpans.length > 0) {
      const hasCacheWrite = infoSpans.some(col => col.name === 'cache_write_tokens');
      if (!hasCacheWrite) {
        logger.info('Detected old database schema (missing cache_write_tokens). Dropping atomic_spans and conversations for recreation.');
        needsMigration = true;
      }
    }

    const infoConv = db.pragma("table_info(conversations)") as any[];
    if (infoConv && infoConv.length > 0) {
      const hasTitle = infoConv.some(col => col.name === 'title');
      if (!hasTitle) {
        logger.info('Detected old database schema (missing title on conversations). Dropping tables for recreation.');
        needsMigration = true;
      }
    }

    const infoCosts = db.pragma("table_info(model_costs)") as any[];
    if (infoCosts && infoCosts.length > 0) {
      const hasCacheWriteCost = infoCosts.some(col => col.name === 'cache_write_cost_per_m');
      if (!hasCacheWriteCost) {
        logger.info('Detected old database schema (missing cache_write_cost_per_m). Dropping tables for recreation.');
        needsMigration = true;
      }
    }
  } catch (err) {
    // Table doesn't exist yet, which is fine
  }

  db.transaction(() => {
    if (needsMigration) {
      db.prepare('DROP TABLE IF EXISTS atomic_spans').run();
      db.prepare('DROP TABLE IF EXISTS conversations').run();
      db.prepare('DROP TABLE IF EXISTS model_costs').run();
    }

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
        cache_read_cost_per_m REAL NOT NULL DEFAULT 0,
        cache_write_cost_per_m REAL NOT NULL DEFAULT 0,
        reasoning_cost_per_m REAL NOT NULL DEFAULT 0
      );
    `).run();

    // 3. Processed Conversations Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        first_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_seen_at INTEGER NOT NULL DEFAULT (unixepoch()),
        source TEXT NOT NULL DEFAULT 'vscode'
      );
    `).run();

    // 4. Atomic Spans Table
    db.prepare(`
      CREATE TABLE IF NOT EXISTS atomic_spans (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        agent_name TEXT,
        raw_telemetry_id INTEGER,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cache_read_tokens INTEGER NOT NULL DEFAULT 0,
        cache_write_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (model_name) REFERENCES model_costs(model_name)
      );
    `).run();

    // Check if agent_name needs to be added via ALTER TABLE if the table already existed
    try {
      const infoSpans = db.pragma("table_info(atomic_spans)") as any[];
      if (infoSpans && infoSpans.length > 0) {
        const hasAgentName = infoSpans.some(col => col.name === 'agent_name');
        if (!hasAgentName) {
          logger.info('Detected atomic_spans missing agent_name column. Performing ALTER TABLE.');
          db.prepare('ALTER TABLE atomic_spans ADD COLUMN agent_name TEXT').run();
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check or alter table for agent_name');
    }

    // Check if raw_telemetry_id needs to be added via ALTER TABLE if the table already existed
    try {
      const infoSpans = db.pragma("table_info(atomic_spans)") as any[];
      if (infoSpans && infoSpans.length > 0) {
        const hasRawTelemetryId = infoSpans.some(col => col.name === 'raw_telemetry_id');
        if (!hasRawTelemetryId) {
          logger.info('Detected atomic_spans missing raw_telemetry_id column. Performing ALTER TABLE.');
          db.prepare('ALTER TABLE atomic_spans ADD COLUMN raw_telemetry_id INTEGER').run();
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check or alter table for raw_telemetry_id');
    }

    // Check if source needs to be added via ALTER TABLE if the table already existed
    try {
      const infoConv = db.pragma("table_info(conversations)") as any[];
      if (infoConv && infoConv.length > 0) {
        const hasSource = infoConv.some(col => col.name === 'source');
        if (!hasSource) {
          logger.info('Detected conversations missing source column. Performing ALTER TABLE.');
          db.prepare('ALTER TABLE conversations ADD COLUMN source TEXT NOT NULL DEFAULT "vscode"').run();
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check or alter table for conversations source');
    }
  })();

  logger.info('Database migrations completed successfully.');
}
