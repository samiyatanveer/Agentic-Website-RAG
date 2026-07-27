/**
 * message.service.js
 * Data-access layer for the `messages` table.
 *
 * Responsibilities (SRP):
 *  - Inserting chat messages (user and assistant turns)
 *  - Fetching full conversation history for rendering
 *  - Fetching a limited recent window for the LLM context (short-term memory)
 *
 * Does NOT generate responses. Does NOT call Ollama.
 */

import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../../config/database.js';
import { MAX_CHAT_HISTORY } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';

// ─── Create ───────────────────────────────────────────────────────────────────

/**
 * Persist a single chat message.
 *
 * @param {string} conversationId
 * @param {'user'|'assistant'|'system'} role
 * @param {string} content
 * @param {{ sources?: object[] }} opts - sources is a list of chunk refs used by RAG
 * @returns {Promise<object>} Created message row
 */
export async function createMessage(conversationId, role, content, { sources = null } = {}) {
  const db = await getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  // Serialize sources array to JSON string for storage
  const sourcesStr = sources ? JSON.stringify(sources) : null;

  try {
    await db.run(
      `INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, conversationId, role, content, sourcesStr, now]
    );
  } catch (err) {
    throw createError(ERROR_CODES.DATABASE_ERROR, `Failed to create message: ${err.message}`, 500);
  }

  return getMessageById(id);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Fetch a single message by ID.
 * Deserializes the `sources` JSON field.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getMessageById(id) {
  const db = await getDatabase();
  const row = await db.get('SELECT * FROM messages WHERE id = ?', [id]);
  return row ? deserializeMessage(row) : null;
}

/**
 * Fetch the complete message history for a conversation, oldest first.
 * Use this for rendering the full chat thread in the UI.
 *
 * @param {string} conversationId
 * @returns {Promise<object[]>}
 */
export async function getMessagesByConversation(conversationId) {
  const db = await getDatabase();
  const rows = await db.all(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );
  return rows.map(deserializeMessage);
}

/**
 * Fetch the most recent N messages for LLM context (short-term memory).
 * Returns them in chronological order (oldest first within the window).
 *
 * @param {string} conversationId
 * @param {number} limit - Defaults to MAX_CHAT_HISTORY from constants
 * @returns {Promise<{ role: string, content: string }[]>} Lean objects for LLM
 */
export async function getRecentMessages(conversationId, limit = MAX_CHAT_HISTORY) {
  const db = await getDatabase();
  // Inner query grabs the latest N rows; outer re-orders them ASC
  const rows = await db.all(
    `SELECT role, content FROM (
       SELECT role, content, created_at
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC
       LIMIT ?
     ) ORDER BY created_at ASC`,
    [conversationId, limit]
  );
  return rows;
}

/**
 * Count messages in a conversation.
 * @param {string} conversationId
 * @returns {Promise<number>}
 */
export async function countMessages(conversationId) {
  const db = await getDatabase();
  const row = await db.get(
    'SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?',
    [conversationId]
  );
  return row?.n ?? 0;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete all messages for a conversation.
 * The FK CASCADE handles this automatically when a conversation is deleted,
 * but this explicit method is useful for clearing history without dropping the conversation.
 *
 * @param {string} conversationId
 * @returns {Promise<number>} Number of messages deleted
 */
export async function deleteMessagesByConversation(conversationId) {
  const db = await getDatabase();
  const result = await db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
  return result.changes;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Parse the JSON-serialized `sources` field back to an array.
 * @param {object} row - Raw DB row
 * @returns {object} Row with sources parsed
 */
function deserializeMessage(row) {
  return {
    ...row,
    sources: row.sources ? JSON.parse(row.sources) : null,
  };
}
