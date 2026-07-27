/**
 * jest.setup.js
 * Sets all required environment variables before any test module is loaded.
 * This prevents env.js from throwing "Missing required environment variable".
 *
 * Uses a unique test database path so tests never touch the real data.
 */

process.env.NODE_ENV       = 'test';
process.env.PORT           = '5001';
process.env.LOG_LEVEL      = 'error';   // Silence info/debug noise during tests
process.env.DATABASE_PATH  = './data/test.db';
process.env.DATABASE_TIMEOUT_MS = '5000';
process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
process.env.OLLAMA_MODEL   = 'mistral';
process.env.OLLAMA_EMBED_MODEL = 'nomic-embed-text';
process.env.CHROMADB_HOST  = 'localhost';
process.env.CHROMADB_PORT  = '8000';
process.env.CHROMADB_COLLECTION_NAME = 'test_chunks';
process.env.SCRAPER_REQUEST_DELAY_MS = '0';
process.env.RAG_CHUNK_SIZE  = '512';
process.env.RAG_CHUNK_OVERLAP = '100';
process.env.RAG_SIMILARITY_THRESHOLD = '0.6';
process.env.RAG_N_RESULTS   = '5';
process.env.RAG_MAX_HISTORY = '10';
