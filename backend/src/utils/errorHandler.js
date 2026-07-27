/**
 * errorHandler.js
 * Centralized error creation and response formatting.
 *
 * Every service and controller should use these helpers for
 * consistent error shapes across the entire API.
 */

import logger from './logger.js';
import { ERROR_CODES, RECOVERY_MESSAGES } from '../config/constants.js';

/**
 * Create a structured error object with code, message, and HTTP status.
 *
 * @param {string} code     - One of ERROR_CODES
 * @param {string} message  - Developer-facing error message
 * @param {number} statusCode - HTTP status code (default 500)
 * @returns {Error}
 */
export function createError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

/**
 * Format any error into the standard API error response shape.
 * Logs the error for debugging, returns user-safe response.
 *
 * @param {Error|object} error
 * @param {string} context - Context label for the log entry
 * @returns {{ success: false, error: { code, message, statusCode, userMessage } }}
 */
export function handleError(error, context = 'Unknown context') {
  logger.error(`Error in ${context}`, {
    message: error.message,
    code: error.code,
    statusCode: error.statusCode,
  });

  const code = error.code || ERROR_CODES.UNKNOWN;
  const statusCode = error.statusCode || 500;

  return {
    success: false,
    error: {
      code,
      message: error.message || 'An unexpected error occurred',
      statusCode,
      userMessage: RECOVERY_MESSAGES[code] || RECOVERY_MESSAGES[ERROR_CODES.UNKNOWN],
    },
  };
}

/**
 * Wrap a result in the standard API success response shape.
 *
 * @param {any} data
 * @returns {{ success: true, data: any }}
 */
export function createSuccessResponse(data) {
  return { success: true, data };
}

/**
 * Retry wrapper with exponential backoff.
 * Only retries errors that are marked as retryable.
 *
 * @param {() => Promise<any>} fn     - Async function to retry
 * @param {number} maxRetries         - Maximum number of attempts
 * @param {number} baseBackoffMs      - Initial backoff in ms (doubles each attempt)
 * @returns {Promise<any>}
 */
export async function withRetry(fn, maxRetries = 3, baseBackoffMs = 1000) {
  const RETRYABLE_CODES = new Set([
    ERROR_CODES.TIMEOUT,
    ERROR_CODES.RATE_LIMITED,
    ERROR_CODES.CONNECTION_ERROR,
  ]);

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!RETRYABLE_CODES.has(error.code)) {
        throw error; // Non-retryable — fail immediately
      }

      if (attempt < maxRetries) {
        const delay = baseBackoffMs * Math.pow(2, attempt - 1);
        logger.warn(`Retry ${attempt}/${maxRetries} in ${delay}ms`, { code: error.code });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
