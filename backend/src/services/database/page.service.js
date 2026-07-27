/**
 * page.service.js
 * Data-access layer for the `pages` table.
 *
 * Responsibilities (SRP):
 *  - CRUD for scraped page records
 *  - Content-hash comparison for change detection
 *
 * Does NOT chunk text, embed content, or know about ChromaDB.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { generateContentHash } from '../../utils/urlNormalizer.js';
import { STATUS, ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Insert a new page record.
 * Automatically generates a SHA-256 content_hash for change detection.
 *
 * @param {string} websiteId
 * @param {string} url - Canonical page URL
 * @param {string} content - Extracted plain text
 * @param {{ title?, status? }} opts
 * @returns {Promise<object>} Created page row
 * @throws On UNIQUE constraint (url + website_id already exists)
 */
export async function createPage(websiteId, url, content, { title = null, status = STATUS.PAGE_COMPLETE } = {}) {
  const db = await getDatabase();
  const id = uuidv4();
  const contentHash = generateContentHash(content);
  const now = new Date().toISOString();

  try {
    await db.run(
      `INSERT INTO pages (id, website_id, url, title, content, content_hash, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, websiteId, url, title, content, contentHash, status, now, now]
    );
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      throw createError(ERROR_CODES.DUPLICATE_URL, `Page already exists for website: ${url}`, 409);
    }
    throw createError(ERROR_CODES.DATABASE_ERROR, `Failed to create page: ${err.message}`, 500);
  }

  return getPageById(id);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a page by primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getPageById(id) {
  const db = await getDatabase();
  return db.get('SELECT * FROM pages WHERE id = ?', [id]);
}

/**
 * Fetch a specific page by URL within a website.
 * @param {string} url
 * @param {string} websiteId
 * @returns {Promise<object|null>}
 */
export async function getPageByUrl(url, websiteId) {
  const db = await getDatabase();
  return db.get('SELECT * FROM pages WHERE url = ? AND website_id = ?', [url, websiteId]);
}

/**
 * List all pages for a given website.
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getPagesByWebsite(websiteId) {
  const db = await getDatabase();
  return db.all('SELECT * FROM pages WHERE website_id = ? ORDER BY created_at ASC', [websiteId]);
}

/**
 * Return only page id, url, title, content_hash — no full content.
 * Used by the scraper to build the link queue without loading everything.
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getPageSummariesByWebsite(websiteId) {
  const db = await getDatabase();
  return db.all(
    'SELECT id, url, title, content_hash, status, created_at FROM pages WHERE website_id = ? ORDER BY created_at ASC',
    [websiteId]
  );
}

/**
 * Count pages belonging to a website.
 * @param {string} websiteId
 * @returns {Promise<number>}
 */
export async function countPagesByWebsite(websiteId) {
  const db = await getDatabase();
  const row = await db.get('SELECT COUNT(*) AS n FROM pages WHERE website_id = ?', [websiteId]);
  return row?.n ?? 0;
}

// ─── Content Change Detection ─────────────────────────────────────────────────

/**
 * Check whether a page's content has changed since the last scrape.
 * Computes the hash of newContent and compares against the stored hash.
 *
 * @param {string} url
 * @param {string} websiteId
 * @param {string} newContent - Freshly scraped plain text
 * @returns {Promise<{ changed: boolean, existingPage: object|null, newHash: string }>}
 */
export async function hasContentChanged(url, websiteId, newContent) {
  const newHash = generateContentHash(newContent);
  const existingPage = await getPageByUrl(url, websiteId);
  if (!existingPage) return { changed: true, existingPage: null, newHash };
  return {
    changed: existingPage.content_hash !== newHash,
    existingPage,
    newHash,
  };
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Patch a page record. Always updates updated_at.
 * @param {string} id
 * @param {object} updates - Partial page fields (title, content, content_hash, status)
 * @returns {Promise<object|null>}
 */
export async function updatePage(id, updates) {
  const db = await getDatabase();
  const allowed = ['title', 'content', 'content_hash', 'status', 'is_crawlable'];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getPageById(id);

  // If content is being updated, regenerate the hash
  if (updates.content && !updates.content_hash) {
    fields.push('content_hash');
    updates.content_hash = generateContentHash(updates.content);
  }

  const sets = [...fields.map((f) => `${f} = ?`), 'updated_at = ?'].join(', ');
  const values = [...fields.map((f) => updates[f]), new Date().toISOString(), id];

  await db.run(`UPDATE pages SET ${sets} WHERE id = ?`, values);
  return getPageById(id);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete all pages for a website.
 * Cascade-deleted automatically when the website is deleted,
 * but this explicit method is available for targeted cleanup.
 *
 * @param {string} websiteId
 * @returns {Promise<number>} Number of pages deleted
 */
export async function deletePagesByWebsite(websiteId) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM pages WHERE website_id = ?', [websiteId]);
  return result.changes;
}
