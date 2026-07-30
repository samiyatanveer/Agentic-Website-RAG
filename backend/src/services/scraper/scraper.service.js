/**
 * scraper.service.js
 * Single-page scrape orchestrator.
 *
 * SRP: Orchestrates one page scrape — fetch → extract → clean → hash.
 *      Does NOT persist to DB. Does NOT crawl multiple pages.
 *
 * Input:  URL string
 * Output: ScrapeResult object ready for the crawler to persist
 */

import { fetchPage, looksJavaScriptHeavy } from './fetcher.service.js';
import { extractContent } from './extractor.service.js';
import { cleanText, hasMinimumContent } from './cleaner.service.js';
import { isAllowed } from './robots.service.js';
import { normalizeURL, generateContentHash } from '../../utils/urlNormalizer.js';
import { createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';

/**
 * @typedef {Object} ScrapeResult
 * @property {string}   url           - Normalized URL
 * @property {string}   finalUrl      - URL after redirects
 * @property {string}   title         - Page title
 * @property {string}   description   - Meta description or first paragraph
 * @property {string|null} canonicalUrl - <link rel="canonical"> if present
 * @property {{ level: number, text: string }[]} headings - h1-h6 headings
 * @property {string}   content       - Cleaned plain text body
 * @property {string}   contentHash   - SHA-256 of cleaned content
 * @property {number}   wordCount     - Word count of cleaned content
 * @property {string[]} links         - Internal links discovered on page
 * @property {object}   metadata      - og:*, author, keywords, lang
 * @property {boolean}  isJsHeavy     - Detected as SPA/JS-heavy
 * @property {number}   responseTimeMs
 * @property {number}   statusCode
 */

/**
 * Scrape a single page and return structured content.
 * Does NOT modify the database.
 *
 * @param {string} rawUrl - URL to scrape
 * @param {{ skipRobotsCheck?: boolean, timeout?: number }} opts
 * @returns {Promise<ScrapeResult>}
 * @throws Structured error with code from ERROR_CODES
 */
export async function scrapePage(rawUrl, opts = {}) {
  // 1. Normalize URL
  let url;
  try {
    url = normalizeURL(rawUrl);
  } catch {
    throw createError(ERROR_CODES.INVALID_URL, `Invalid URL: ${rawUrl}`, 400);
  }

  logger.debug(`Scraping page: ${url}`);

  // 2. robots.txt check
  if (!opts.skipRobotsCheck) {
    const allowed = await isAllowed(url);
    if (!allowed) {
      throw createError(ERROR_CODES.BLOCKED_BY_ROBOTS, `Blocked by robots.txt: ${url}`, 403);
    }
  }

  // 3. Fetch raw HTML
  const fetchResult = await fetchPage(url, { timeout: opts.timeout });
  const { html, finalUrl, statusCode, responseTimeMs } = fetchResult;
  logger.info('[Scraper] HTTP response', { url, statusCode, finalUrl: finalUrl || url });

  // 4. Detect JS-heavy pages (heuristic — Phase 4 will handle these with Puppeteer)
  const isJsHeavy = looksJavaScriptHeavy(html);
  if (isJsHeavy) {
    logger.debug(`Page may be JS-heavy: ${url}`);
  }

  // 5. Extract structured content
  const extracted = extractContent(html, finalUrl || url);

  // 6. Clean + validate body text
  let cleanedText, contentHash, wordCount;
  try {
    const indexableText = [
      extracted.title && `Title: ${extracted.title}`,
      extracted.description && `Description: ${extracted.description}`,
      extracted.headings?.length && `Headings: ${extracted.headings.map((heading) => heading.text).join(' | ')}`,
      extracted.content,
    ].filter(Boolean).join('\n\n');
    ({ cleanedText, contentHash, wordCount } = cleanText(indexableText, url));
    logger.info('[Scraper] Extracted text', { url, textLength: cleanedText.length, wordCount });
  } catch (err) {
    // If content is empty after cleaning, re-throw with original code
    throw err;
  }

  return {
    url,
    finalUrl: finalUrl || url,
    title:        extracted.title       || '',
    description:  extracted.description || '',
    canonicalUrl: extracted.canonicalUrl || null,
    headings:     extracted.headings    || [],
    content:      cleanedText,
    contentHash,
    wordCount,
    links:        extracted.links       || [],
    metadata:     extracted.metadata    || {},
    isJsHeavy,
    responseTimeMs,
    statusCode,
  };
}

/**
 * Check whether a page's content has meaningfully changed since last scrape.
 * Compares fresh fetch against a known hash WITHOUT persisting anything.
 *
 * @param {string} url
 * @param {string} knownHash - Previously stored content hash
 * @returns {Promise<{ changed: boolean, newHash: string|null }>}
 */
export async function checkPageChanged(url, knownHash) {
  try {
    const result = await scrapePage(url, { skipRobotsCheck: false });
    return {
      changed: result.contentHash !== knownHash,
      newHash: result.contentHash,
    };
  } catch {
    // If we can't fetch it, assume changed so it gets retried
    return { changed: true, newHash: null };
  }
}
