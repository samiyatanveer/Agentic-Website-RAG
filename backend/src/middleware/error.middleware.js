/**
 * error.middleware.js
 * Global error-handling middleware for Express.
 * Must be registered AFTER all routes (4-argument signature).
 *
 * Catches any error passed via next(error) and returns a
 * consistent JSON error response. Never leaks stack traces.
 */

import logger from '../utils/logger.js';
import { ERROR_CODES, RECOVERY_MESSAGES } from '../config/constants.js';

// eslint-disable-next-line no-unused-vars
export default function errorMiddleware(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const code = err.code || ERROR_CODES.UNKNOWN;

  logger.error(`Unhandled error [${req.method} ${req.path}]`, {
    message: err.message,
    code,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message || 'An unexpected error occurred',
      statusCode,
      userMessage: RECOVERY_MESSAGES[code] || RECOVERY_MESSAGES[ERROR_CODES.UNKNOWN],
    },
  });
}
