import { Router, Request, Response } from 'express';
import fs from 'fs';
import { db, dbPath } from '../db/database.js';
import logger from '../utils/logger.js';
import { processTelemetry } from '../services/telemetryProcessor.js';

const router = Router();

function getDbSize() {
  if (dbPath === ':memory:') {
    return { size_bytes: 0, size_mb: 0 };
  }
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      return {
        size_bytes: stats.size,
        size_mb: Number((stats.size / (1024 * 1024)).toFixed(2))
      };
    }
  } catch (err) {
    logger.error({ err }, 'Failed to get DB file size');
  }
  return { size_bytes: 0, size_mb: 0 };
}

// GET /api/maintenance/db-stat
router.get('/api/maintenance/db-stat', (req: Request, res: Response) => {
  return res.status(200).json(getDbSize());
});

// DELETE /api/maintenance/raw-telemetry
router.delete('/api/maintenance/raw-telemetry', (req: Request, res: Response) => {
  const olderThanDays = Number(req.query.older_than_days ?? 30);
  if (isNaN(olderThanDays) || olderThanDays < 0) {
    return res.status(400).json({ error: 'Invalid older_than_days parameter' });
  }

  try {
    const cutoffSeconds = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 3600;
    
    // Perform deletion
    const result = db.prepare('DELETE FROM raw_telemetry WHERE created_at < ?').run(cutoffSeconds);
    const deletedCount = result.changes;

    // Checkpoint WAL and VACUUM to reclaim disk space
    if (dbPath !== ':memory:') {
      try {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.pragma('vacuum');
      } catch (pragmaErr) {
        logger.warn({ pragmaErr }, 'Failed to vacuum/checkpoint database, continuing');
      }
    }

    const newStats = getDbSize();

    return res.status(200).json({
      deleted_count: deletedCount,
      ...newStats
    });
  } catch (err) {
    logger.error({ err }, 'Failed to purge raw telemetry');
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// POST /api/maintenance/reprocess
router.post('/api/maintenance/reprocess', (req: Request, res: Response) => {
  try {
    db.transaction(() => {
      // 1. Guardar los títulos personalizados en memoria
      const existingTitles = db.prepare("SELECT id, title FROM conversations WHERE title IS NOT NULL AND title != ''").all() as { id: string; title: string }[];
      logger.info({ count: existingTitles.length }, 'Preserving conversation titles before reprocessing');

      // 2. Limpiar las tablas derivadas
      db.prepare('DELETE FROM atomic_spans').run();
      db.prepare('DELETE FROM conversations').run();

      // 3. Obtener todas las telemetrías crudas en orden cronológico
      const rows = db.prepare('SELECT id, payload FROM raw_telemetry ORDER BY id ASC').all() as { id: number; payload: string }[];

      logger.info({ count: rows.length }, 'Reprocessing raw telemetry payloads to regenerate conversations');

      // 4. Volver a procesar cada una
      for (const row of rows) {
        processTelemetry(row.id, row.payload);
      }

      // 5. Restaurar los títulos personalizados
      const updateStmt = db.prepare('UPDATE conversations SET title = ? WHERE id = ?');
      for (const item of existingTitles) {
        updateStmt.run(item.title, item.id);
      }
      logger.info('Restored conversation titles successfully');
    })();

    return res.status(200).json({
      status: 'ok',
      message: 'Conversations and spans regenerated successfully'
    });
  } catch (err) {
    logger.error({ err }, 'Failed to reprocess telemetry');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err instanceof Error ? err.message : String(err)
    });
  }
});

export default router;
