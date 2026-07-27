/**
 * env.js
 * Loads environment variables from .env and validates all required vars.
 * Import this module first before anything else in the app.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Resolve the .env path relative to the backend root (not src/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const requiredVars = [
  'NODE_ENV',
  'PORT',
  'DATABASE_PATH',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'CHROMADB_HOST',
  'CHROMADB_PORT',
];

for (const varName of requiredVars) {
  if (!process.env[varName]) {
    throw new Error(
      `[env.js] Missing required environment variable: ${varName}\n` +
      `Copy .env.example to backend/.env and fill in the values.`
    );
  }
}

const env = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',
  LOG_FORMAT: process.env.LOG_FORMAT || 'pretty',

  // Database
  DATABASE_PATH: process.env.DATABASE_PATH || './data/rag.db',
  DATABASE_TIMEOUT_MS: parseInt(process.env.DATABASE_TIMEOUT_MS, 10) || 5000,

  // Ollama
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mistral',
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) || 60000,
  OLLAMA_TEMPERATURE: parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.3,
  OLLAMA_TOP_P: parseFloat(process.env.OLLAMA_TOP_P) || 0.9,
  OLLAMA_MAX_TOKENS: parseInt(process.env.OLLAMA_MAX_TOKENS, 10) || 512,

  // ChromaDB
  CHROMADB_HOST: process.env.CHROMADB_HOST || 'localhost',
  CHROMADB_PORT: parseInt(process.env.CHROMADB_PORT, 10) || 8000,
  CHROMADB_PERSIST_DIRECTORY: process.env.CHROMADB_PERSIST_DIRECTORY || './data/chroma',
  CHROMADB_COLLECTION_NAME: process.env.CHROMADB_COLLECTION_NAME || 'website_chunks',

  // Scraper
  SCRAPER_REQUEST_DELAY_MS: parseInt(process.env.SCRAPER_REQUEST_DELAY_MS, 10) || 2000,
  SCRAPER_REQUEST_TIMEOUT_MS: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT_MS, 10) || 30000,
  SCRAPER_MAX_CONCURRENT: parseInt(process.env.SCRAPER_MAX_CONCURRENT, 10) || 2,
  SCRAPER_MAX_PAGES_PER_DOMAIN: parseInt(process.env.SCRAPER_MAX_PAGES_PER_DOMAIN, 10) || 50,
  SCRAPER_MAX_RETRIES: parseInt(process.env.SCRAPER_MAX_RETRIES, 10) || 3,
  SCRAPER_RESPECT_ROBOTS_TXT: process.env.SCRAPER_RESPECT_ROBOTS_TXT !== 'false',
  SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || 'RAGBot/1.0 (Learning Project)',

  // RAG
  RAG_CHUNK_SIZE: parseInt(process.env.RAG_CHUNK_SIZE, 10) || 512,
  RAG_CHUNK_OVERLAP: parseInt(process.env.RAG_CHUNK_OVERLAP, 10) || 100,
  RAG_SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.6,
  RAG_N_RESULTS: parseInt(process.env.RAG_N_RESULTS, 10) || 5,
  RAG_MAX_HISTORY: parseInt(process.env.RAG_MAX_HISTORY, 10) || 10,
};

export default env;
