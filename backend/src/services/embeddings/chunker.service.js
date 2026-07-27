/**
 * chunker.service.js
 * Text chunking with sliding window and overlap.
 *
 * SRP: Takes a plain-text string and returns an array of chunk objects.
 *      Does NOT call Ollama, ChromaDB, or SQLite.
 *
 * Strategy:
 *  - Split text into sentences (period/newline boundaries)
 *  - Accumulate sentences into chunks until RAG_CHUNK_SIZE tokens is reached
 *  - Slide forward by (CHUNK_SIZE - OVERLAP) tokens to create the next chunk
 *  - Every chunk carries metadata: index, tokenCount, charStart, charEnd
 */

import { estimateTokens } from '../../utils/tokenCounter.js';
import env from '../../config/env.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TextChunk
 * @property {string} text        - Raw chunk text
 * @property {number} index       - 0-based position in the document
 * @property {number} tokenCount  - Estimated token count
 * @property {number} charStart   - Character offset in original text
 * @property {number} charEnd     - Character offset in original text
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Split plain text into overlapping chunks suitable for embedding.
 *
 * @param {string} text               - Cleaned plain text from extractor/cleaner
 * @param {{ chunkSize?: number, overlap?: number }} opts
 * @returns {TextChunk[]}             - Array of chunk objects (never empty if text has content)
 */
export function chunkText(text, opts = {}) {
  if (!text || typeof text !== 'string') return [];

  const chunkSize = opts.chunkSize ?? env.RAG_CHUNK_SIZE;
  const overlap   = opts.overlap   ?? env.RAG_CHUNK_OVERLAP;

  if (overlap >= chunkSize) {
    throw new Error(`Overlap (${overlap}) must be less than chunkSize (${chunkSize})`);
  }

  // Tokenize: split into individual words (each word = 1 token estimate)
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // If the entire text fits in one chunk, return it directly
  if (words.length <= chunkSize) {
    return [makeChunk(words, 0, text, 0, words.length - 1)];
  }

  const chunks = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);

    chunks.push(makeChunk(chunkWords, chunkIndex, text, start, end - 1));

    chunkIndex++;
    start += chunkSize - overlap; // slide forward by stride

    // Safety: if stride is 0 or negative, force progress
    if (start <= chunks[chunks.length - 1]._startWord) {
      start = chunks[chunks.length - 1]._startWord + 1;
    }
  }

  return chunks;
}

/**
 * Chunk text from a page record (convenience wrapper).
 * Attaches page metadata to each chunk for ChromaDB storage.
 *
 * @param {object} page - Page DB record { id, website_id, url, title, content }
 * @param {{ chunkSize?, overlap? }} opts
 * @returns {(TextChunk & { pageId: string, websiteId: string, pageUrl: string, pageTitle: string })[]}
 */
export function chunkPage(page, opts = {}) {
  const chunks = chunkText(page.content ?? '', opts);
  return chunks.map((chunk) => ({
    ...chunk,
    pageId:    page.id,
    websiteId: page.website_id,
    pageUrl:   page.url,
    pageTitle: page.title ?? '',
  }));
}

/**
 * Estimate how many chunks a text will produce, without actually chunking.
 * Useful for progress estimation.
 *
 * @param {string} text
 * @param {{ chunkSize?, overlap? }} opts
 * @returns {number}
 */
export function estimateChunkCount(text, opts = {}) {
  if (!text) return 0;
  const chunkSize = opts.chunkSize ?? env.RAG_CHUNK_SIZE;
  const overlap   = opts.overlap   ?? env.RAG_CHUNK_OVERLAP;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return 0;
  if (wordCount <= chunkSize) return 1;
  const stride = chunkSize - overlap;
  return Math.ceil((wordCount - overlap) / stride);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build a TextChunk from a word slice.
 * Computes charStart/charEnd by finding the words in the original text.
 *
 * @param {string[]} words
 * @param {number}   index
 * @param {string}   originalText
 * @param {number}   wordStart   - index of first word in `words` array (for internal tracking)
 * @param {number}   wordEnd     - index of last word
 * @returns {TextChunk}
 */
function makeChunk(words, index, originalText, wordStart, wordEnd) {
  const text = words.join(' ');

  // Approximate char offsets by locating the text in the original
  // This is best-effort — exact char positions aren't critical for RAG
  const charStart = originalText.indexOf(words[0] ?? '') ;
  const charEnd   = charStart + text.length;

  return {
    text,
    index,
    tokenCount:  estimateTokens(text),
    charStart:   Math.max(0, charStart),
    charEnd:     Math.min(charEnd, originalText.length),
    _startWord:  wordStart, // internal, used for stride calculation
  };
}
