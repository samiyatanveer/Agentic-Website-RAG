/**
 * conversation.service.js
 * Data-access layer for the `conversations` table.
 *
 * Responsibilities (SRP):
 *  - CRUD for conversation records
 *  - Querying conversations by website or user
 *
 * Does NOT manage messages — see message.service.js.
 * Does NOT run LLM inference.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Create a new conversation linked to a website.
 *
 * @param {string} websiteId
 * @param {{ userId?, title? }} opts
 * @returns {Promise<object>} Created conversation row
 */
export async function createConversation(websiteId, { userId = null, title = null } = {}) {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  try {
    await db.run(
      `INSERT INTO conversations (id, user_id, website_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, websiteId, title, now, now]
    );
  } catch (err) {
    throw createError(ERROR_CODES.DATABASE_ERROR, `Failed to create conversation: ${err.message}`, 500);
  }

  return getConversationById(id);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a conversation by primary key.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getConversationById(id) {
  const db = await getDatabase();
  return db.get('SELECT * FROM conversations WHERE id = ?', [id]);
}

/**
 * List all conversations for a given website, newest first.
 * @param {string} websiteId
 * @returns {Promise<object[]>}
 */
export async function getConversationsByWebsite(websiteId) {
  const db = await getDatabase();
  return db.all(
    'SELECT * FROM conversations WHERE website_id = ? ORDER BY updated_at DESC',
    [websiteId]
  );
}

/**
 * List all conversations for a given user, newest first.
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function getConversationsByUser(userId) {
  const db = await getDatabase();
  return db.all(
    'SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC',
    [userId]
  );
}

// ─── Update ───────────────────────────────────────────────────────────────────

/**
 * Patch a conversation's title.
 * @param {string} id
 * @param {object} updates - { title? }
 * @returns {Promise<object|null>}
 */
export async function updateConversation(id, updates) {
  const db = await getDatabase();
  const allowed = ['title'];
  const fields = Object.keys(updates).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getConversationById(id);

  const sets = [...fields.map((f) => `${f} = ?`), 'updated_at = ?'].join(', ');
  const values = [...fields.map((f) => updates[f]), new Date().toISOString(), id];

  await db.run(`UPDATE conversations SET ${sets} WHERE id = ?`, values);
  return getConversationById(id);
}

/**
 * Touch a conversation's updated_at timestamp.
 * Called after every new message to keep the list sorted by activity.
 *
 * @param {string} id
 */
export async function touchConversation(id) {
  const db = await getDatabase();
  await db.run('UPDATE conversations SET updated_at = ? WHERE id = ?', [new Date().toISOString(), id]);
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a conversation and all its messages (CASCADE).
 * @param {string} id
 * @returns {Promise<boolean>} true if a row was deleted
 */
export async function deleteConversation(id) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM conversations WHERE id = ?', [id]);
  return result.changes > 0;
}

/**
 * Delete all conversations for a website.
 * Used when a website is fully wiped.
 * @param {string} websiteId
 * @returns {Promise<number>} Number of conversations deleted
 */
export async function deleteConversationsByWebsite(websiteId) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM conversations WHERE website_id = ?', [websiteId]);
  return result.changes;
}
