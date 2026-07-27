/**
 * health.controller.js
 * GET /api/health
 *
 * Checks the status of all external services:
 *  - SQLite database
 *  - Ollama LLM service
 *  - ChromaDB vector store
 *
 * Returns 200 if all healthy, 503 if any service is down.
 */

import { getDatabase } from '../config/database.js';
import { checkOllamaHealth } from '../config/ollama.js';
import { checkChromaHealth } from '../config/chroma.js';
import { createSuccessResponse } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';

export async function getHealth(req, res) {
  const checks = await Promise.allSettled([
    checkDatabaseHealth(),
    checkOllamaHealth(),
    checkChromaHealth(),
  ]);

  const [dbResult, ollamaResult, chromaResult] = checks;

  const services = {
    database: dbResult.status === 'fulfilled' && dbResult.value.healthy
      ? 'connected'
      : 'disconnected',
    ollama: ollamaResult.status === 'fulfilled' && ollamaResult.value.healthy
      ? 'connected'
      : 'disconnected',
    chromadb: chromaResult.status === 'fulfilled' && chromaResult.value.healthy
      ? 'connected'
      : 'disconnected',
  };

  const errors = [];
  if (services.database === 'disconnected') {
    errors.push(dbResult.reason?.message || dbResult.value?.error || 'Database unavailable');
  }
  if (services.ollama === 'disconnected') {
    errors.push(ollamaResult.reason?.message || ollamaResult.value?.error || 'Ollama unavailable');
  }
  if (services.chromadb === 'disconnected') {
    errors.push(chromaResult.reason?.message || chromaResult.value?.error || 'ChromaDB unavailable');
  }

  const allHealthy = Object.values(services).every((s) => s === 'connected');
  const status = allHealthy ? 'healthy' : 'degraded';
  const httpStatus = allHealthy ? 200 : 503;

  const payload = {
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services,
    ...(errors.length > 0 ? { errors } : {}),
    // Additional Ollama details when connected
    ...(ollamaResult.value?.healthy
      ? {
          ollama: {
            model: ollamaResult.value.requiredModel,
            modelAvailable: ollamaResult.value.modelAvailable,
            availableModels: ollamaResult.value.models,
          },
        }
      : {}),
  };

  logger[allHealthy ? 'info' : 'warn'](`Health check: ${status}`, services);

  return res.status(httpStatus).json(createSuccessResponse(payload));
}

// ─── Internal helper ─────────────────────────────────────────────────────────

async function checkDatabaseHealth() {
  try {
    const db = await getDatabase();
    // A lightweight query to confirm the connection is alive
    await db.get('SELECT 1 AS alive');
    return { healthy: true };
  } catch (error) {
    return { healthy: false, error: error.message };
  }
}

export default { getHealth };
