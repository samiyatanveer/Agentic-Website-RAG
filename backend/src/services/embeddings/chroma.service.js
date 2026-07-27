/**
 * chroma.service.js
 * ChromaDB collection management and vector operations.
 *
 * SRP: All ChromaDB interactions live here.
 *      Does NOT generate embeddings, chunk text, or touch SQLite.
 *
 * Uses the ChromaDB REST API directly via axios (existing chromaClient).
 * Collection name: CHROMADB_COLLECTION_NAME (default: "website_chunks")
 *
 * ChromaDB REST API reference:
 *   POST   /api/v1/collections                        — create collection
 *   GET    /api/v1/collections/:name                  — get collection (returns id)
 *   POST   /api/v1/collections/:id/upsert             — upsert documents
 *   POST   /api/v1/collections/:id/query              — similarity search
 *   DELETE /api/v1/collections/:id/delete             — delete by IDs
 *   GET    /api/v1/collections/:id/count              — document count
 */

import chromaClient from '../../config/chroma.js';
import { createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';

// ─── Collection bootstrap ─────────────────────────────────────────────────────

let _collectionId = null; // Cached after first getOrCreateCollection() call

/**
 * Get the ChromaDB collection, creating it if it doesn't exist.
 * Caches the collection ID in-process to avoid redundant API calls.
 *
 * @returns {Promise<string>} Collection ID
 * @throws E_CHROMADB_ERROR if ChromaDB is unreachable
 */
export async function getOrCreateCollection() {
  if (_collectionId) return _collectionId;

  const name = env.CHROMADB_COLLECTION_NAME;

  try {
    // Try to get existing collection first
    const getRes = await chromaClient.get(`/api/v1/collections/${name}`);
    _collectionId = getRes.data.id;
    logger.debug(`ChromaDB collection found: ${name} (id=${_collectionId})`);
    return _collectionId;
  } catch (getErr) {
    if (getErr.response?.status !== 404 && getErr.code !== 'ECONNREFUSED') {
      // Unexpected error
      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `Failed to get ChromaDB collection: ${getErr.message}`,
        500
      );
    }

    if (getErr.code === 'ECONNREFUSED') {
      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `ChromaDB not running at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
        503
      );
    }

    // Collection doesn't exist — create it
    try {
      const createRes = await chromaClient.post('/api/v1/collections', {
        name,
        metadata: {
          description: 'Website content chunks for RAG',
          created_by:  'agentic-website-rag',
        },
      });
      _collectionId = createRes.data.id;
      logger.info(`ChromaDB collection created: ${name} (id=${_collectionId})`);
      return _collectionId;
    } catch (createErr) {
      if (createErr.code === 'ECONNREFUSED') {
        throw createError(
          ERROR_CODES.CHROMADB_ERROR,
          `ChromaDB not running at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
          503
        );
      }
      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `Failed to create ChromaDB collection: ${createErr.message}`,
        500
      );
    }
  }
}

/**
 * Reset the cached collection ID (for testing / collection recreation).
 */
export function resetCollectionCache() {
  _collectionId = null;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert one or more chunk embeddings into ChromaDB.
 *
 * Each item must have:
 *   - id: string (unique across the collection — use chunkId from SQLite)
 *   - vector: number[]
 *   - text: string (stored as document for retrieval)
 *   - metadata: object (pageId, websiteId, pageUrl, chunkIndex, etc.)
 *
 * @param {{ id: string, vector: number[], text: string, metadata: object }[]} items
 * @returns {Promise<void>}
 */
export async function upsertEmbeddings(items) {
  if (!items || items.length === 0) return;

  const collectionId = await getOrCreateCollection();

  const ids        = items.map((i) => i.id);
  const embeddings = items.map((i) => i.vector);
  const documents  = items.map((i) => i.text);
  const metadatas  = items.map((i) => i.metadata ?? {});

  try {
    await chromaClient.post(`/api/v1/collections/${collectionId}/upsert`, {
      ids,
      embeddings,
      documents,
      metadatas,
    });

    logger.debug(`ChromaDB upsert: ${items.length} vectors stored`);
  } catch (err) {
    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB upsert failed: ${err.response?.data?.error ?? err.message}`,
      500
    );
  }
}

// ─── Query / Similarity search ────────────────────────────────────────────────

/**
 * Find the most similar chunks to a query vector.
 *
 * @param {number[]} queryVector - Embedding of the user's query
 * @param {{
 *   nResults?: number,       — How many results (default: RAG_N_RESULTS)
 *   websiteId?: string,      — Filter to a specific website (optional)
 *   threshold?: number,      — Minimum similarity score (optional, 0–1)
 * }} opts
 * @returns {Promise<SimilarityResult[]>}
 */
export async function querySimilar(queryVector, opts = {}) {
  const nResults  = opts.nResults  ?? env.RAG_N_RESULTS;
  const websiteId = opts.websiteId ?? null;
  const threshold = opts.threshold ?? env.RAG_SIMILARITY_THRESHOLD;

  const collectionId = await getOrCreateCollection();

  const body = {
    query_embeddings: [queryVector],
    n_results:        nResults,
    include:          ['documents', 'metadatas', 'distances'],
  };

  // Apply metadata filter if websiteId is given
  if (websiteId) {
    body.where = { websiteId: { $eq: websiteId } };
  }

  let response;
  try {
    response = await chromaClient.post(`/api/v1/collections/${collectionId}/query`, body);
  } catch (err) {
    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB query failed: ${err.response?.data?.error ?? err.message}`,
      500
    );
  }

  const data = response.data;

  // ChromaDB returns parallel arrays: ids[0], distances[0], documents[0], metadatas[0]
  const ids        = data.ids?.[0]        ?? [];
  const distances  = data.distances?.[0]  ?? [];
  const documents  = data.documents?.[0]  ?? [];
  const metadatas  = data.metadatas?.[0]  ?? [];

  const results = ids.map((id, i) => ({
    id,
    text:       documents[i] ?? '',
    metadata:   metadatas[i] ?? {},
    distance:   distances[i] ?? 1,
    // ChromaDB uses L2 distance — convert to similarity score (0–1)
    // For cosine distance: score = 1 - distance (distance is already 0–2)
    // We use a normalized approximation: score = 1 - (distance / 2)
    score:      Math.max(0, Math.min(1, 1 - (distances[i] ?? 1) / 2)),
  }));

  // Filter by threshold if specified
  return threshold > 0 ? results.filter((r) => r.score >= threshold) : results;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete specific chunk vectors by ID from ChromaDB.
 * Used when a page's content changes and needs to be re-embedded.
 *
 * @param {string[]} ids - Chunk IDs to delete (same IDs used in upsertEmbeddings)
 * @returns {Promise<void>}
 */
export async function deleteEmbeddings(ids) {
  if (!ids || ids.length === 0) return;

  const collectionId = await getOrCreateCollection();

  try {
    await chromaClient.post(`/api/v1/collections/${collectionId}/delete`, { ids });
    logger.debug(`ChromaDB delete: ${ids.length} vectors removed`);
  } catch (err) {
    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB delete failed: ${err.response?.data?.error ?? err.message}`,
      500
    );
  }
}

/**
 * Delete all vectors belonging to a website.
 * Used when a website is removed from the system.
 *
 * @param {string} websiteId
 * @returns {Promise<void>}
 */
export async function deleteWebsiteEmbeddings(websiteId) {
  const collectionId = await getOrCreateCollection();

  try {
    await chromaClient.post(`/api/v1/collections/${collectionId}/delete`, {
      where: { websiteId: { $eq: websiteId } },
    });
    logger.info(`ChromaDB: deleted all vectors for websiteId=${websiteId}`);
  } catch (err) {
    // Non-fatal: log and continue
    logger.warn(`ChromaDB deleteWebsiteEmbeddings failed: ${err.message}`);
  }
}

// ─── Info ─────────────────────────────────────────────────────────────────────

/**
 * Count total vectors in the collection.
 * @returns {Promise<number>}
 */
export async function countVectors() {
  try {
    const collectionId = await getOrCreateCollection();
    const res = await chromaClient.get(`/api/v1/collections/${collectionId}/count`);
    return res.data ?? 0;
  } catch {
    return 0;
  }
}

/**
 * @typedef {Object} SimilarityResult
 * @property {string} id
 * @property {string} text
 * @property {object} metadata
 * @property {number} distance  - Raw L2 distance (lower = more similar)
 * @property {number} score     - Normalized similarity 0–1 (higher = more similar)
 */
