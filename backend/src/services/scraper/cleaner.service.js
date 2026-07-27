/**
 * cleaner.service.js
 * Text post-processor for extracted page content.
 *
 * SRP: Takes plain-text content (post-Cheerio) and makes it clean for chunking.
 *      No HTML, no HTTP, no DB.
 *
 * Operations:
 *  - Remove lingering HTML entities
 *  - Strip control characters
 *  - Collapse excessive whitespace
 *  - Remove common boilerplate sentences
 *  - Enforce minimum content length
 *  - Truncate at maximum safe length
 */

import { generateContentHash } from '../../utils/urlNormalizer.js';
import { ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum number of characters for content to be considered meaningful */
const MIN_CONTENT_LENGTH = 100;

/** Hard cap to prevent enormous pages from blowing memory */
const MAX_CONTENT_LENGTH = 500_000; // ~500KB of plain text

/**
 * Common boilerplate phrases found on many websites.
 * Lines containing only these phrases are dropped.
 */
const BOILERPLATE_PATTERNS = [
  /^all rights reserved\.?$/i,
  /^copyright \d{4}/i,
  /^privacy policy$/i,
  /^terms of (service|use)$/i,
  /^cookie policy$/i,
  /^accept( all)? cookies?$/i,
  /^(click|tap) (here|to)/i,
  /^read more$/i,
  /^learn more$/i,
  /^see more$/i,
  /^show more$/i,
  /^subscribe( now)?$/i,
  /^sign (up|in|out)$/i,
  /^log (in|out)$/i,
  /^home$/i,
  /^back to top$/i,
  /^share (this|on)$/i,
  /^follow us( on)?$/i,
  /^get in touch$/i,
  /^contact us$/i,
  /^our services$/i,
  /^about us$/i,
  /^skip to (main )?content$/i,
  /^\s*\|\s*$/,        // Lone pipe characters (separators)
  /^[-–—|•·•]+$/,     // Lines of only separators
  /^\d+$/,            // Lines of only digits (e.g., page numbers)
];

// HTML entity map for the most common entities
const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—',
  '&hellip;': '…', '&laquo;': '«', '&raquo;': '»',
  '&copy;': '©', '&reg;': '®', '&trade;': '™',
  '&#x27;': "'", '&#x2F;': '/', '&#x60;': '`',
};

// ─── Main cleaner function ────────────────────────────────────────────────────

/**
 * Clean and normalize extracted page text.
 * Returns the cleaned text with its SHA-256 content hash.
 *
 * @param {string} rawText - Plain text as extracted by extractor.service
 * @param {string} url     - Used in error messages only
 * @returns {{ cleanedText: string, contentHash: string, wordCount: number }}
 * @throws {Error} with code E_EMPTY_CONTENT if content is too short
 */
export function cleanText(rawText, url = '') {
  if (!rawText || typeof rawText !== 'string') {
    throw createError(ERROR_CODES.EMPTY_CONTENT, `No content extracted from: ${url}`, 422);
  }

  let text = rawText;

  // 1. Decode HTML entities that Cheerio may have left behind
  text = decodeEntities(text);

  // 2. Strip control characters (null bytes, form feeds, etc.)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // 3. Normalize Unicode whitespace to regular spaces/newlines
  text = text
    .replace(/\u00A0/g, ' ') // Non-breaking space
    .replace(/\u200B/g, '')  // Zero-width space
    .replace(/\uFEFF/g, '')  // BOM
    .replace(/\r\n/g, '\n')  // CRLF → LF
    .replace(/\r/g, '\n');   // CR → LF

  // 4. Remove boilerplate lines
  text = filterBoilerplateLines(text);

  // 5. Collapse whitespace within lines + remove blank-line runs
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 6. Enforce minimum length
  if (text.length < MIN_CONTENT_LENGTH) {
    throw createError(
      ERROR_CODES.EMPTY_CONTENT,
      `Content too short (${text.length} chars < ${MIN_CONTENT_LENGTH}): ${url}`,
      422
    );
  }

  // 7. Truncate at hard cap
  if (text.length > MAX_CONTENT_LENGTH) {
    text = text.slice(0, MAX_CONTENT_LENGTH);
  }

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const contentHash = generateContentHash(text);

  return { cleanedText: text, contentHash, wordCount };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode common HTML entities from a plain-text string.
 * @param {string} text
 * @returns {string}
 */
export function decodeEntities(text) {
  // Named entities
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replaceAll(entity, char);
  }
  // Numeric decimal entities like &#160;
  result = result.replace(/&#(\d+);/g, (_, code) => {
    try { return String.fromCharCode(parseInt(code, 10)); } catch { return ''; }
  });
  // Numeric hex entities like &#x00A0;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCharCode(parseInt(hex, 16)); } catch { return ''; }
  });
  return result;
}

/**
 * Remove lines that match known boilerplate patterns.
 * @param {string} text
 * @returns {string}
 */
export function filterBoilerplateLines(text) {
  const lines = text.split('\n');
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    for (const pattern of BOILERPLATE_PATTERNS) {
      if (pattern.test(trimmed)) return false;
    }
    return true;
  });
  return filtered.join('\n');
}

/**
 * Quick estimate of whether a text string has enough content to be useful.
 * Does NOT throw — returns boolean.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function hasMinimumContent(text) {
  if (!text || typeof text !== 'string') return false;
  return text.trim().length >= MIN_CONTENT_LENGTH;
}
