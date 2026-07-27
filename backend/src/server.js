/**
 * server.js
 * Application entry point.
 * Initializes the database and starts the HTTP server.
 */

import app from './app.js';
import env from './config/env.js';
import { initializeDatabase, closeDatabase } from './config/database.js';
import logger from './utils/logger.js';

async function startServer() {
  try {
    // Initialize database (creates tables if they don't exist)
    await initializeDatabase();

    // Start listening
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Backend running on http://localhost:${env.PORT}`);
      logger.info(`📋 Health check: http://localhost:${env.PORT}/api/health`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
    });

    // ─── Graceful Shutdown ─────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully...`);
      server.close(async () => {
        await closeDatabase();
        logger.info('Server closed');
        process.exit(0);
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // ─── Unhandled Rejection Safety Net ───────────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection', { reason: String(reason) });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
