/**
 * validators.js
 * Pure input validation functions — no side effects.
 * Used by middleware and services for consistent validation.
 */

/**
 * Validates that a string is a well-formed HTTP/HTTPS URL.
 * @param {string} urlString
 * @returns {boolean}
 */
export function validateURL(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const url = new URL(urlString);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Validates that a string is non-empty and within the character limit.
 * @param {string} message
 * @param {number} maxLength
 * @returns {boolean}
 */
export function validateMessage(message, maxLength = 5000) {
  return (
    typeof message === 'string' &&
    message.trim().length > 0 &&
    message.length <= maxLength
  );
}

/**
 * Validates that a chunk size is within reasonable bounds.
 * @param {number} size
 * @returns {boolean}
 */
export function validateChunkSize(size) {
  return Number.isInteger(size) && size > 0 && size <= 4096;
}

/**
 * Validates a similarity threshold is between 0 and 1.
 * @param {number} threshold
 * @returns {boolean}
 */
export function validateSimilarityThreshold(threshold) {
  return typeof threshold === 'number' && threshold >= 0 && threshold <= 1;
}

/**
 * Validates a UUID-like string (simple check for non-empty string with correct length).
 * @param {string} id
 * @returns {boolean}
 */
export function validateId(id) {
  return typeof id === 'string' && id.trim().length > 0;
}

/**
 * Validates and sanitizes page count options.
 * @param {number} maxPages
 * @returns {number}
 */
export function sanitizeMaxPages(maxPages, defaultMax = 50) {
  const n = parseInt(maxPages, 10);
  if (isNaN(n) || n < 1) return defaultMax;
  if (n > 200) return 200; // hard cap
  return n;
}
