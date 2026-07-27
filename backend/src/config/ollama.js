/**
 * ollama.js
 * Axios client configured for the Ollama REST API.
 * Provides health check and connection validation.
 */

import axios from 'axios';
import env from './env.js';

const ollamaClient = axios.create({
  baseURL: env.OLLAMA_BASE_URL,
  timeout: env.OLLAMA_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Check whether Ollama is running and list available models.
 * @returns {{ healthy: boolean, models?: string[], error?: string }}
 */
export async function checkOllamaHealth() {
  try {
    const response = await ollamaClient.get('/api/tags', { timeout: 5000 });
    const models = (response.data?.models ?? []).map((m) => m.name);
    return {
      healthy: true,
      models,
      requiredModel: env.OLLAMA_MODEL,
      modelAvailable: models.some((m) => m.startsWith(env.OLLAMA_MODEL)),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.code === 'ECONNREFUSED'
        ? `Ollama not running at ${env.OLLAMA_BASE_URL} — run 'ollama serve'`
        : error.message,
    };
  }
}

export default ollamaClient;
