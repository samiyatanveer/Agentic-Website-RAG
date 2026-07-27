/**
 * chroma.js
 * Axios client configured for the ChromaDB REST API.
 * Provides health check and collection access helpers.
 */

import axios from 'axios';
import env from './env.js';

const chromaClient = axios.create({
  baseURL: `http://${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Check whether ChromaDB is reachable.
 * @returns {{ healthy: boolean, version?: string, error?: string }}
 */
export async function checkChromaHealth() {
  try {
    const response = await chromaClient.get('/api/v1', { timeout: 5000 });
    return {
      healthy: true,
      version: response.data?.nanosecond_heartbeat ? 'running' : response.data?.version ?? 'unknown',
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.code === 'ECONNREFUSED'
        ? `ChromaDB not running at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT} — run 'chroma run --path ./data/chroma'`
        : error.message,
    };
  }
}

export default chromaClient;
