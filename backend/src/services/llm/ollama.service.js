/**
 * ollama.service.js
 * Wrapper around the Ollama /api/generate endpoint.
 *
 * SRP: Turn a prompt string into a generated text response.
 *      Does NOT build prompts, retrieve context, or manage conversations.
 */

import ollamaClient from '../../config/ollama.js';
import { createError, withRetry } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';

// ─── Generate ─────────────────────────────────────────────────────────────────

/**
 * Generate a completion from Ollama.
 *
 * @param {string} prompt - The full prompt (system + context + history + question)
 * @param {{ model?: string, temperature?: number, topP?: number, maxTokens?: number }} opts
 * @returns {Promise<string>} Generated text
 * @throws E_OLLAMA_OFFLINE if Ollama is not running
 */
export async function generate(prompt, opts = {}) {
  const model       = opts.model       ?? env.OLLAMA_MODEL;
  const temperature = opts.temperature ?? env.OLLAMA_TEMPERATURE;
  const top_p       = opts.topP        ?? env.OLLAMA_TOP_P;
  const num_predict = opts.maxTokens   ?? env.OLLAMA_MAX_TOKENS;

  return withRetry(
    async () => {
      try {
        const response = await ollamaClient.post('/api/generate', {
          model,
          prompt,
          stream:  false,
          options: { temperature, top_p, num_predict },
        });

        const text = response.data?.response;
        if (typeof text !== 'string') {
          throw createError(ERROR_CODES.UNKNOWN, 'Ollama returned no response text', 500);
        }

        return text.trim();
      } catch (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          throw createError(
            ERROR_CODES.OLLAMA_OFFLINE,
            `Ollama not reachable at ${env.OLLAMA_BASE_URL} — run 'ollama serve'`,
            503
          );
        }
        if (err.code && err.code !== ERROR_CODES.UNKNOWN) throw err;
        throw createError(
          ERROR_CODES.UNKNOWN,
          `Ollama generate failed: ${err.message}`,
          err.response?.status || 500
        );
      }
    },
    2,    // maxRetries (LLM calls are slow; limit retries)
    1000  // baseBackoffMs
  );
}

/**
 * Check that Ollama is running and the chat model is available.
 * @returns {Promise<{ healthy: boolean, model: string, available: boolean, error?: string }>}
 */
export async function checkOllamaStatus() {
  try {
    const response = await ollamaClient.get('/api/tags', { timeout: 5000 });
    const models   = (response.data?.models ?? []).map((m) => m.name);
    const model    = env.OLLAMA_MODEL;
    const available = models.some((m) => m.startsWith(model));

    return { healthy: true, model, available, models };
  } catch (err) {
    return { healthy: false, model: env.OLLAMA_MODEL, available: false, error: err.message };
  }
}

export default { generate, checkOllamaStatus };
