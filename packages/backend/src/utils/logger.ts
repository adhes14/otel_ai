import pino from 'pino';

// Detect if we are in test mode
const isTest = process.env.NODE_ENV === 'test' || typeof globalThis.vitest !== 'undefined';

const logger = pino({
  level: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  transport: (!isTest && process.env.NODE_ENV !== 'production')
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard'
        }
      }
    : undefined
});

export default logger;
