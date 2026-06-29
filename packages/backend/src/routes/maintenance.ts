import { Router, Request, Response } from 'express';
import fs from 'fs';
import { db, dbPath } from '../db/database.js';
import logger from '../utils/logger.js';

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

export default router;
