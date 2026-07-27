/**
 * chunk.service.js
 * Data-access layer for the `chunks` table.
 *
 * Responsibilities (SRP):
 *  - Bulk insertion of text chunks from a single page
 *  - Tracking which chunks have been embedded (is_embedded flag)
 *  - Querying unembedded chunks for the embedding pipeline
 *
 * Does NOT split text into chunks — that is the chunker's job.
 * Does NOT call Ollama or ChromaDB.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Bulk-insert an array of text chunks for a single page.
 * Uses a single transaction for atomicity and performance.
 *
 * @param {string} pageId
 * @param {string} websiteId
 * @param {{ text: string, index: number, tokenCount?: number }[]} chunks
 * @returns {Promise<string[]>} Array of inserted chunk IDs
 * @throws If the transaction fails
 */
export async function createChunks(pageId, websiteId, chunks) {
  if (!chunks || chunks.length === 0) return [];
  const db = await getDatabase();
  const now = new Date().toISOString();
  const ids = [];

  try {
    await db.run('BEGIN');

    const stmt = await db.prepare(
      `INSERT INTO chunks (id, page_id, website_id, chunk_text, chunk_index, token_count, is_embedded, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    );

    for (const chunk of chunks) {
      const id = uuidv4();
      await stmt.run([id, pageId, websiteId, chunk.text, chunk.index, chunk.tokenCount ?? null, now]);
      ids.push(id);
    }

    await stmt.finalize();
    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw createError(ERROR_CODES.DATABASE_ERROR, `Chunk insertion failed: ${err.message}`, 500);
  }

  return ids;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch all chunks for a given page.
 * @param {string} pageId
 * @returns {Promise<object[]>}
 */
export async function getChunksByPage(pageId) {
  const db = await getDatabase();
  return db.all('SELECT * FROM chunks WHERE page_id = ? ORDER BY chunk_index ASC', [pageId]);
}

/**
 * Fetch all chunks for a given website.
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getChunksByWebsite(websiteId) {
  const db = await getDatabase();
  return db.all('SELECT * FROM chunks WHERE website_id = ? ORDER BY chunk_index ASC', [websiteId]);
}

/**
 * Fetch all chunks that have NOT yet been sent to the embedding pipeline.
 * Used by the embedding service to find work to do.
 *
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getUnembeddedChunks(websiteId) {
  const db = await getDatabase();
  return db.all(
    'SELECT * FROM chunks WHERE website_id = ? AND is_embedded = 0 ORDER BY chunk_index ASC',
    [websiteId]
  );
}

/**
 * Count total chunks for a website.
 * @param {string} websiteId
 * @returns {Promise<number>}
 */
export async function countChunksByWebsite(websiteId) {
  const db = await getDatabase();
  const row = await db.get('SELECT COUNT(*) AS n FROM chunks WHERE website_id = ?', [websiteId]);
  return row?.n ?? 0;
}

/**
 * Count embedded chunks for a website.
 * @param {string} websiteId
 * @returns {Promise<number>}
 */
export async function countEmbeddedChunks(websiteId) {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT COUNT(*) AS n FROM chunks WHERE website_id = ? AND is_embedded = 1',
    [websiteId]
  );
  return row?.n ?? 0;
}

// ─── Update (embedding tracking) ──────────────────────────────────────────────

/**
 * Mark a single chunk as embedded.
 * @param {string} chunkId
 */
export async function markChunkEmbedded(chunkId) {
  const db = await getDatabase();
  await db.run('UPDATE chunks SET is_embedded = 1 WHERE id = ?', [chunkId]);
}

/**
 * Mark multiple chunks as embedded in a single UPDATE.
 * More efficient than calling markChunkEmbedded() in a loop.
 *
 * @param {string[]} chunkIds
 */
export async function markChunksEmbedded(chunkIds) {
  if (!chunkIds || chunkIds.length === 0) return;
  const db = await getDatabase();
  const placeholders = chunkIds.map(() => '?').join(', ');
  await db.run(`UPDATE chunks SET is_embedded = 1 WHERE id IN (${placeholders})`, chunkIds);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete all chunks belonging to a page.
 * Called when a page's content has changed and needs to be re-chunked.
 *
 * @param {string} pageId
 * @returns {Promise<number>} Number of chunks deleted
 */
export async function deleteChunksByPage(pageId) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM chunks WHERE page_id = ?', [pageId]);
  return result.changes;
}

/**
 * Delete all chunks for a website.
 * @param {string} websiteId
 * @returns {Promise<number>} Number of chunks deleted
 */
export async function deleteChunksByWebsite(websiteId) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM chunks WHERE website_id = ?', [websiteId]);
  return result.changes;
}
