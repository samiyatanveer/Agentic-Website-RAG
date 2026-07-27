/**
 * app.js
 * Express application factory.
 * Sets up all middleware and mounts routes.
 * Exported as a module — server.js imports this and calls listen().
 */

import express from 'express';
import corsMiddleware    from './middleware/cors.middleware.js';
import loggingMiddleware from './middleware/logging.middleware.js';
import errorMiddleware   from './middleware/error.middleware.js';
import mountRoutes from './routes/index.js';

const app = express();

// ─── Core Middleware ──────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(loggingMiddleware);

// ─── API Routes ───────────────────────────────────────────────────────────────
mountRoutes(app);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'E_NOT_FOUND',
      message: `Route not found: ${req.method} ${req.path}`,
      statusCode: 404,
    },
  });
});

// ─── Global Error Handler (must be last) ─────────────────────────────────────
app.use(errorMiddleware);

export default app;
