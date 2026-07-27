/**
 * scrapeJob.service.js
 * Data-access layer for the `scrape_jobs` table.
 *
 * Responsibilities (SRP):
 *  - Job lifecycle management (queued → in_progress → completed | failed)
 *  - Real-time progress tracking (page counts, current URL, ETA)
 *  - Scrape history for a website
 *
 * Does NOT perform any HTTP requests or HTML parsing.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { STATUS, ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new scrape job with status 'queued'.
 *
 * @param {string} websiteId
 * @returns {Promise<object>} Created job row
 */
export async function createScrapeJob(websiteId) {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run(
      `INSERT INTO scrape_jobs
         (id, website_id, status, pages_found, pages_crawled, pages_processed,
          chunks_generated, embeddings_stored, error_count, created_at)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, ?)`,
      [id, websiteId, STATUS.QUEUED, now]
    );
  } catch (err) {
    throw createError(ERROR_CODES.DATABASE_ERROR, `Failed to create scrape job: ${err.message}`, 500);
  }

  return getScrapeJob(id);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a scrape job by ID.
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getScrapeJob(jobId) {
  const db = await getDatabase();
  return db.get('SELECT * FROM scrape_jobs WHERE id = ?', [jobId]);
}

/**
 * List all scrape jobs for a website, newest first.
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getScrapeJobsByWebsite(websiteId) {
  const db = await getDatabase();
  return db.all(
    'SELECT * FROM scrape_jobs WHERE website_id = ? ORDER BY created_at DESC',
    [websiteId]
  );
}

/**
 * Get the most recent scrape job for a website.
 * @param {string} websiteId
 * @returns {Promise<object|null>}
 */
export async function getLatestScrapeJob(websiteId) {
  const db = await getDatabase();
  return db.get(
    'SELECT * FROM scrape_jobs WHERE website_id = ? ORDER BY created_at DESC LIMIT 1',
    [websiteId]
  );
}

// ─── Lifecycle Transitions ────────────────────────────────────────────────────

/**
 * Transition a job from 'queued' to 'in_progress'.
 * Sets started_at timestamp.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>} Updated job row
 */
export async function markJobStarted(jobId) {
  const db = await getDatabase();
  await db.run(
    'UPDATE scrape_jobs SET status = ?, started_at = ? WHERE id = ?',
    [STATUS.IN_PROGRESS, new Date().toISOString(), jobId]
  );
  return getScrapeJob(jobId);
}

/**
 * Transition a job to 'completed'.
 * Sets completed_at timestamp.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function markJobCompleted(jobId) {
  const db = await getDatabase();
  await db.run(
    'UPDATE scrape_jobs SET status = ?, completed_at = ?, eta_seconds = NULL WHERE id = ?',
    [STATUS.COMPLETED, new Date().toISOString(), jobId]
  );
  return getScrapeJob(jobId);
}

/**
 * Transition a job to 'failed'.
 * Records the error message for debugging.
 *
 * @param {string} jobId
 * @param {string} errorMessage
 * @returns {Promise<object|null>}
 */
export async function markJobFailed(jobId, errorMessage) {
  const db = await getDatabase();
  await db.run(
    `UPDATE scrape_jobs
     SET status = ?, completed_at = ?, error_message = ?, eta_seconds = NULL
     WHERE id = ?`,
    [STATUS.FAILED, new Date().toISOString(), errorMessage, jobId]
  );
  return getScrapeJob(jobId);
}

// ─── Progress Updates ─────────────────────────────────────────────────────────

/**
 * Update incremental scraping progress counters and metadata.
 * Only updates fields that are present in the `updates` object.
 *
 * Supported fields:
 *  - pages_found        {number} Total pages discovered via link crawl
 *  - pages_crawled      {number} Pages whose HTML has been fetched
 *  - pages_processed    {number} Pages whose text has been extracted
 *  - chunks_generated   {number} Text chunks created
 *  - embeddings_stored  {number} Chunks stored in ChromaDB
 *  - current_page_url   {string} URL being processed right now
 *  - error_count        {number} Non-fatal errors encountered
 *  - eta_seconds        {number} Estimated seconds remaining
 *
 * @param {string} jobId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateScrapeProgress(jobId, updates) {
  const db = await getDatabase();
  const allowed = [
    'pages_found',
    'pages_crawled',
    'pages_processed',
    'chunks_generated',
    'embeddings_stored',
    'current_page_url',
    'error_count',
    'eta_seconds',
  ];

  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getScrapeJob(jobId);

  const sets = fields.map((f) => `${f} = ?`).join(', ');
  const values = [...fields.map((f) => updates[f]), jobId];

  await db.run(`UPDATE scrape_jobs SET ${sets} WHERE id = ?`, values);
  return getScrapeJob(jobId);
}

/**
 * Increment a counter field by delta (avoids read-modify-write).
 * Useful for high-frequency progress updates during a scrape.
 *
 * @param {string} jobId
 * @param {'pages_crawled'|'pages_processed'|'chunks_generated'|'embeddings_stored'|'error_count'} field
 * @param {number} delta - Amount to add (default 1)
 */
export async function incrementJobCounter(jobId, field, delta = 1) {
  const allowed = ['pages_crawled', 'pages_processed', 'chunks_generated', 'embeddings_stored', 'error_count'];
  if (!allowed.includes(field)) {
    throw createError(ERROR_CODES.INVALID_INPUT, `Invalid counter field: ${field}`, 400);
  }
  const db = await getDatabase();
  await db.run(`UPDATE scrape_jobs SET ${field} = ${field} + ? WHERE id = ?`, [delta, jobId]);
}

/**
 * Compute a simple progress percentage for display.
 * Returns 0 if pages_found is 0 (avoids divide-by-zero).
 *
 * @param {object} job - A scrape_jobs row
 * @returns {{ pagesPercent: number, embeddingPercent: number }}
 */
export function calculateProgress(job) {
  const pagesPercent = job.pages_found > 0
    ? Math.min(100, Math.round((job.pages_crawled / job.pages_found) * 100))
    : 0;

  const embeddingPercent = job.chunks_generated > 0
    ? Math.min(100, Math.round((job.embeddings_stored / job.chunks_generated) * 100))
    : 0;

  return { pagesPercent, embeddingPercent };
}
