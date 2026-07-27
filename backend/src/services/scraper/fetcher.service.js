/**
 * fetcher.service.js
 * HTTP fetching for static pages.
 *
 * SRP: Only fetches raw HTML — no parsing, no DB, no robots checking.
 *
 * Features:
 *  - Configurable timeout
 *  - Realistic browser-like headers
 *  - Automatic retry with exponential backoff for transient errors
 *  - Returns raw HTML + response metadata
 */

import axios from 'axios';
import { createError, withRetry } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

/** Realistic headers to avoid being blocked by bot-detection */
const DEFAULT_HEADERS = {
  'User-Agent': env.SCRAPER_USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Cache-Control': 'no-cache',
};

/**
 * Fetch a URL and return the raw HTML string with response metadata.
 *
 * @param {string} url - Fully-qualified URL to fetch
 * @param {{ timeout?: number, headers?: object }} opts
 * @returns {Promise<{
 *   html: string,
 *   finalUrl: string,
 *   statusCode: number,
 *   contentType: string,
 *   responseTimeMs: number
 * }>}
 * @throws Structured error with code from ERROR_CODES
 */
export async function fetchPage(url, opts = {}) {
  const timeout = opts.timeout ?? env.SCRAPER_REQUEST_TIMEOUT_MS;
  const headers = { ...DEFAULT_HEADERS, ...(opts.headers ?? {}) };

  const start = Date.now();

  const doFetch = async () => {
    let res;
    try {
      res = await axios.get(url, {
        timeout,
        headers,
        maxRedirects: 5,
        responseType: 'text',
        validateStatus: (status) => status < 500, // Don't throw on 4xx
      });
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        throw createError(ERROR_CODES.TIMEOUT, `Request timed out: ${url}`, 408);
      }
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        throw createError(ERROR_CODES.CONNECTION_ERROR, `Connection failed: ${url} — ${err.message}`, 503);
      }
      throw createError(ERROR_CODES.CONNECTION_ERROR, `Fetch failed: ${url} — ${err.message}`, 503);
    }

    if (res.status === 429) {
      throw createError(ERROR_CODES.RATE_LIMITED, `Rate limited by server: ${url}`, 429);
    }
    if (res.status === 403 || res.status === 401) {
      throw createError(ERROR_CODES.CONNECTION_ERROR, `Access denied (${res.status}): ${url}`, res.status);
    }
    if (res.status >= 400) {
      throw createError(ERROR_CODES.CONNECTION_ERROR, `HTTP ${res.status}: ${url}`, res.status);
    }

    const contentType = res.headers['content-type'] || '';
    if (!contentType.includes('html') && !contentType.includes('text')) {
      throw createError(ERROR_CODES.EMPTY_CONTENT, `Non-HTML content type (${contentType}): ${url}`, 415);
    }

    const html = typeof res.data === 'string' ? res.data : String(res.data);

    if (!html || html.trim().length < 50) {
      throw createError(ERROR_CODES.EMPTY_CONTENT, `Empty or near-empty response from: ${url}`, 204);
    }

    return {
      html,
      finalUrl: res.request?.res?.responseUrl || url, // After redirects
      statusCode: res.status,
      contentType,
      responseTimeMs: Date.now() - start,
    };
  };

  return withRetry(doFetch, env.SCRAPER_MAX_RETRIES, 1000);
}

/**
 * Quick HEAD request to check if a URL is reachable without downloading the body.
 * Returns true if reachable and returns HTML content.
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isReachable(url) {
  try {
    const res = await axios.head(url, {
      timeout: 5000,
      headers: DEFAULT_HEADERS,
      maxRedirects: 3,
      validateStatus: (s) => s < 500,
    });
    const ct = res.headers['content-type'] || '';
    return res.status < 400 && (ct.includes('html') || ct.includes('text'));
  } catch {
    return false;
  }
}

/**
 * Detect whether a page likely requires JavaScript rendering.
 * Heuristic: content is small but many <script> tags are present.
 *
 * @param {string} html - Raw HTML
 * @returns {boolean}
 */
export function looksJavaScriptHeavy(html) {
  const bodyTextLength = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length;
  const scriptMatches = (html.match(/<script/gi) || []).length;
  // If there is almost no text but many script tags → likely a SPA
  return bodyTextLength < 500 && scriptMatches > 3;
}
