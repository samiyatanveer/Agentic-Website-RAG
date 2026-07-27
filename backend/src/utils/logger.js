/**
 * logger.js
 * Centralized logging utility.
 * Outputs structured log messages with level, timestamp, and optional data.
 *
 * Usage:
 *   import logger from '../utils/logger.js';
 *   logger.info('Server started', { port: 5000 });
 *   logger.error('Something failed', error);
 */

import env from '../config/env.js';

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[env.LOG_LEVEL] ?? LEVELS.info;

const COLORS = {
  debug: '\x1b[36m',  // cyan
  info:  '\x1b[32m',  // green
  warn:  '\x1b[33m',  // yellow
  error: '\x1b[31m',  // red
  reset: '\x1b[0m',
};

function timestamp() {
  return new Date().toISOString();
}

function formatData(data) {
  if (!data || Object.keys(data).length === 0) return '';
  try {
    return ' ' + JSON.stringify(data);
  } catch {
    return ' [unserializable data]';
  }
}

function log(level, message, data = {}) {
  if (LEVELS[level] < currentLevel) return;

  const color = COLORS[level] ?? '';
  const reset = COLORS.reset;
  const label = level.toUpperCase().padEnd(5);
  const dataStr = data instanceof Error
    ? ` ${data.message}${data.stack ? '\n' + data.stack : ''}`
    : formatData(data);

  console.log(`${color}[${label}]${reset} ${timestamp()} ${message}${dataStr}`);
}

const logger = {
  debug: (message, data = {}) => log('debug', message, data),
  info:  (message, data = {}) => log('info',  message, data),
  warn:  (message, data = {}) => log('warn',  message, data),
  error: (message, data = {}) => log('error', message, data),
};

export default logger;
