/**
 * website.service.js
 * Data-access layer for the `websites` table.
 *
 * Responsibilities (SRP):
 *  - CRUD for website records
 *  - Duplicate detection via url_hash
 *  - Incrementing page/chunk counters
 *
 * Does NOT know about scraping, embeddings, or ChromaDB.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { normalizeAndHash } from '../../utils/urlNormalizer.js';
import { STATUS, ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Insert a new website record.
 * Normalizes the URL and generates a url_hash for deduplication.
 *
 * @param {string} url - Raw URL from the user
 * @param {{ title?, description?, userId? }} opts
 * @returns {Promise<object>} The created website row
 * @throws If the URL is already in the database
 */
export async function createWebsite(url, { title = null, description = null, userId = null } = {}) {
  const db = await getDatabase();
  const { normalized, hash } = normalizeAndHash(url);
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run(
      `INSERT INTO websites (id, user_id, url, url_hash, title, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, normalized, hash, title, description, STATUS.ACTIVE, now, now]
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      throw createError(ERROR_CODES.DUPLICATE_URL, `Website already exists: ${normalized}`, 409);
    }
    throw createError(ERROR_CODES.DATABASE_ERROR, `Failed to create website: ${err.message}`, 500);
  }

  return getWebsiteById(id);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a website by its primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getWebsiteById(id) {
  const db = await getDatabase();
  return db.get('SELECT * FROM websites WHERE id = ?', [id]);
}

/**
 * Fetch a website by its url_hash (for duplicate detection).
 * @param {string} urlHash - 64-char SHA-256 hex
 * @returns {Promise<object|null>}
 */
export async function getWebsiteByHash(urlHash) {
  const db = await getDatabase();
  return db.get('SELECT * FROM websites WHERE url_hash = ?', [urlHash]);
}

/**
 * List all websites, newest first.
 * @returns {Promise<object[]>}
 */
export async function getAllWebsites() {
  const db = await getDatabase();
  return db.all('SELECT * FROM websites ORDER BY created_at DESC');
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

/**
 * Check whether a URL has already been scraped.
 * Normalizes the URL before hashing — catches equivalent-but-different URLs.
 *
 * @param {string} url - Raw URL string
 * @returns {Promise<{ isDuplicate: boolean, websiteId?: string, website?: object }>}
 */
export async function checkDuplicateWebsite(url) {
  const { hash } = normalizeAndHash(url);
  const existing = await getWebsiteByHash(hash);
  if (!existing) return { isDuplicate: false };
  return { isDuplicate: true, websiteId: existing.id, website: existing };
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Patch a website record with arbitrary fields.
 * Always updates updated_at.
 *
 * @param {string} id
 * @param {object} updates - Partial website fields
 * @returns {Promise<object|null>} Updated row or null if not found
 */
export async function updateWebsite(id, updates) {
  const db = await getDatabase();
  const allowed = ['title', 'description', 'status', 'total_pages', 'total_chunks', 'error_message'];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getWebsiteById(id);

  const sets = [...fields.map((f) => `${f} = ?`), 'updated_at = ?'].join(', ');
  const values = [...fields.map((f) => updates[f]), new Date().toISOString(), id];

  await db.run(`UPDATE websites SET ${sets} WHERE id = ?`, values);
  return getWebsiteById(id);
}

/**
 * Atomically increment total_pages and/or total_chunks counters.
 * Uses SQL arithmetic to avoid read-modify-write race conditions.
 *
 * @param {string} id
 * @param {{ pages?: number, chunks?: number }} delta
 */
export async function incrementWebsiteStats(id, { pages = 0, chunks = 0 } = {}) {
  const db = await getDatabase();
  await db.run(
    `UPDATE websites
     SET total_pages  = total_pages  + ?,
         total_chunks = total_chunks + ?,
         updated_at   = ?
     WHERE id = ?`,
    [pages, chunks, new Date().toISOString(), id]
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a website and all its dependent data (CASCADE).
 * Pages, chunks, conversations, and scrape_jobs are removed by FK constraints.
 *
 * @param {string} id
 * @returns {Promise<boolean>} true if a row was deleted
 */
export async function deleteWebsite(id) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM websites WHERE id = ?', [id]);
  return result.changes > 0;
}
