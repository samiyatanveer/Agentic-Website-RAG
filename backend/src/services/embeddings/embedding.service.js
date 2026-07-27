/**
 * embedding.service.js
 * Generate vector embeddings via the Ollama /api/embeddings endpoint.
 *
 * SRP: Only responsible for turning text strings into float[] vectors.
 *      Does NOT chunk text, store to DB, or interact with ChromaDB.
 *
 * Model: OLLAMA_EMBED_MODEL (default: nomic-embed-text)
 *   - 768-dimensional float32 vectors
 *   - Runs locally via Ollama
 */

import ollamaClient from '../../config/ollama.js';
import { withRetry, createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';
import sleep from '../../utils/sleep.js';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a single text string.
 *
 * @param {string} text  - The text to embed
 * @param {string} [model] - Override the default embed model
 * @returns {Promise<number[]>} Float vector
 * @throws E_OLLAMA_OFFLINE if Ollama is unreachable
 */
export async function embedText(text, model = env.OLLAMA_EMBED_MODEL) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw createError(ERROR_CODES.INVALID_INPUT, 'embedText: text must be a non-empty string', 400);
  }

  return withRetry(
    async () => {
      try {
        const response = await ollamaClient.post('/api/embeddings', {
          model,
          prompt: text.trim(),
        });

        const embedding = response.data?.embedding;
        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw createError(
            ERROR_CODES.UNKNOWN,
            `Ollama returned empty embedding for model ${model}`,
            500
          );
        }

        return embedding;
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          throw createError(
            ERROR_CODES.OLLAMA_OFFLINE,
            `Ollama not reachable at ${env.OLLAMA_BASE_URL} — run 'ollama serve'`,
            503
          );
        }
        if (err.code && err.code !== ERROR_CODES.UNKNOWN) throw err; // already structured
        throw createError(
          ERROR_CODES.UNKNOWN,
          `Embedding failed: ${err.message}`,
          err.response?.status || 500
        );
      }
    },
    3,    // maxRetries
    500   // baseBackoffMs
  );
}

/**
 * Embed an array of text chunks in sequence.
 * Returns an array of { chunkIndex, text, vector } objects.
 *
 * Processes sequentially (not in parallel) to avoid overwhelming Ollama,
 * with a small delay between requests.
 *
 * @param {{ text: string, index: number }[]} chunks
 * @param {{ model?: string, delayMs?: number, onProgress?: (done, total) => void }} opts
 * @returns {Promise<{ chunkIndex: number, text: string, vector: number[] }[]>}
 */
export async function embedChunks(chunks, opts = {}) {
  if (!chunks || chunks.length === 0) return [];

  const model    = opts.model    ?? env.OLLAMA_EMBED_MODEL;
  const delayMs  = opts.delayMs  ?? 50;   // Small delay between Ollama calls
  const onProgress = opts.onProgress ?? null;

  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    logger.debug(`Embedding chunk ${i + 1}/${chunks.length} (${chunk.tokenCount ?? '?'} tokens)`);

    const vector = await embedText(chunk.text, model);

    results.push({
      chunkIndex: chunk.index,
      text:       chunk.text,
      vector,
    });

    if (onProgress) onProgress(i + 1, chunks.length);
    if (delayMs > 0 && i < chunks.length - 1) await sleep(delayMs);
  }

  return results;
}

/**
 * Embed a single query string for similarity search.
 * Identical to embedText() but named clearly for call-site readability.
 *
 * @param {string} query
 * @returns {Promise<number[]>}
 */
export async function embedQuery(query) {
  return embedText(query, env.OLLAMA_EMBED_MODEL);
}

/**
 * Check that the embedding model is available in Ollama.
 * Returns true if ready, false if model not found or Ollama offline.
 *
 * @returns {Promise<boolean>}
 */
export async function isEmbedModelAvailable() {
  try {
    const response = await ollamaClient.get('/api/tags', { timeout: 5000 });
    const models = (response.data?.models ?? []).map((m) => m.name);
    return models.some((m) => m.startsWith(env.OLLAMA_EMBED_MODEL));
  } catch {
    return false;
  }
}
