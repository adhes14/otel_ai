import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { runMigrations } from './db/migrations.js';
import tracesRouter from './routes/traces.js';
import modelCostsRouter from './routes/modelCosts.js';
import conversationsRouter from './routes/conversations.js';
import maintenanceRouter from './routes/maintenance.js';
import rawTelemetryRouter from './routes/raw_telemetry.js';
import logger from './utils/logger.js';

// Run migrations on startup
try {
  runMigrations();
} catch (err) {
  logger.fatal({ err }, 'Failed to run database migrations');
  process.exit(1);
}

const app = express();

// Middleware
app.use(cors());

// Configure Express to accept large payloads (50MB as specified in PRD)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// HTTP Request Logger
const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as any).vitest !== 'undefined';
if (!isTest) {
  // @ts-expect-error - pinoHttp default import typing resolution mismatch
  app.use(pinoHttp({ logger }));
}

// Routes
app.use(tracesRouter);
app.use(modelCostsRouter);
app.use(conversationsRouter);
app.use(maintenanceRouter);
app.use(rawTelemetryRouter);

// GET /healthz
app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4318;

// Do not listen if running in a test environment (Vitest handles testing router/app directly)
if (!isTest) {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`OTLP/HTTP Collector server running on http://localhost:${PORT}`);
  });
}

export default app;
