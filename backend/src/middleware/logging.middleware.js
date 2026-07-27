/**
 * logging.middleware.js
 * HTTP request/response logging middleware.
 * Logs method, path, status, and duration for every request.
 */

import logger from '../utils/logger.js';

export default function loggingMiddleware(req, res, next) {
  const start = Date.now();
  const { method, path: reqPath, ip } = req;

  // Log when the response finishes
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

    logger[level](`${method} ${reqPath} → ${status} (${duration}ms)`, {
      ip: ip || 'unknown',
    });
  });

  next();
}
