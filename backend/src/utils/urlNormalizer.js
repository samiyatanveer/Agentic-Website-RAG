/**
 * urlNormalizer.js
 * URL normalization and hashing for duplicate detection.
 *
 * Normalizes URLs to a canonical form so that:
 *   https://Example.com/page/ == https://example.com/page
 *   https://example.com:443/  == https://example.com/
 */

import { createHash } from 'crypto';

/**
 * Normalize a URL to a canonical form for deduplication.
 * - Lowercases hostname
 * - Removes trailing slashes from path
 * - Removes URL fragments (#section)
 * - Strips default ports (80 for HTTP, 443 for HTTPS)
 * - Sorts query parameters alphabetically
 *
 * @param {string} urlString
 * @returns {string} Normalized URL
 * @throws {Error} If the URL is invalid
 */
export function normalizeURL(urlString) {
  try {
    const url = new URL(urlString.trim());

    // Remove fragment
    url.hash = '';

    // Lowercase hostname
    url.hostname = url.hostname.toLowerCase();

    // Remove default ports
    if (url.protocol === 'https:' && url.port === '443') url.port = '';
    if (url.protocol === 'http:'  && url.port === '80')  url.port = '';

    // Remove trailing slash from path (except root)
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }

    // Sort query params for consistency
    const params = [...new URLSearchParams(url.search).entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = new URLSearchParams(params).toString();

    return url.href;
  } catch {
    throw new Error(`Invalid URL: "${urlString}"`);
  }
}

/**
 * Generate a SHA-256 hash of a normalized URL.
 * Used as the unique key for website deduplication.
 *
 * @param {string} normalizedUrl
 * @returns {string} 64-character hex hash
 */
export function generateURLHash(normalizedUrl) {
  return createHash('sha256').update(normalizedUrl).digest('hex');
}

/**
 * Normalize a URL and immediately return its hash.
 * Convenience wrapper combining both operations.
 *
 * @param {string} urlString
 * @returns {{ normalized: string, hash: string }}
 */
export function normalizeAndHash(urlString) {
  const normalized = normalizeURL(urlString);
  const hash = generateURLHash(normalized);
  return { normalized, hash };
}

/**
 * Generate a SHA-256 hash of arbitrary content.
 * Used for page-level content change detection.
 *
 * @param {string} content
 * @returns {string} 64-character hex hash
 */
export function generateContentHash(content) {
  return createHash('sha256').update(content).digest('hex');
}
