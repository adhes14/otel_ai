import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env configuration if not already loaded
const envPath = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envPath)) {
  const result = dotenvConfig(envPath);
  if (result) {
    logger.debug({ envPath }, 'Loaded environment variables from monorepo root');
  }
}

function dotenvConfig(envFilePath: string) {
  try {
    const envConfig = fs.readFileSync(envFilePath, 'utf-8');
    for (const line of envConfig.split('\n')) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        // Remove surrounding quotes if any
        if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
          value = value.substring(1, value.length - 1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

// Resolve DB path
const rawDbPath = process.env.DB_PATH || '../../../../data/otel_ai.db';
export let dbPath: string;

if (path.isAbsolute(rawDbPath)) {
  dbPath = rawDbPath;
} else if (rawDbPath === ':memory:') {
  dbPath = ':memory:';
} else {
  // Resolve relative to this directory (src/db)
  dbPath = path.resolve(__dirname, rawDbPath);
}

if (dbPath !== ':memory:') {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

logger.info({ dbPath }, 'Opening SQLite database');

export const db = new Database(dbPath, {
  verbose: (message) => logger.debug({ sql: message }, 'SQL Query Executed')
});

// Enable WAL mode for concurrency and performance
if (dbPath !== ':memory:') {
  db.pragma('journal_mode = WAL');
}
