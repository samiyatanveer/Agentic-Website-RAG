/**
 * constants.js
 * All magic numbers and application-wide constants in one place.
 * Never hardcode these values elsewhere — import from here.
 */

// ─── Chunking ─────────────────────────────────────────────────────────────────
export const CHUNK_SIZE_TOKENS = 512;
export const CHUNK_OVERLAP_TOKENS = 100;
export const MAX_CHUNK_SIZE_BYTES = 2048;

// ─── RAG Retrieval ────────────────────────────────────────────────────────────
export const SIMILARITY_THRESHOLD = 0.6;
export const N_RESULTS_RETRIEVE = 5;
export const FALLBACK_N_RESULTS = 3;

// ─── Scraper ──────────────────────────────────────────────────────────────────
export const REQUEST_DELAY_MS = 2000;
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_CONCURRENT_REQUESTS = 2;
export const MAX_PAGES_PER_DOMAIN = 50;
export const MAX_RETRIES = 3;

// ─── Ollama ───────────────────────────────────────────────────────────────────
export const OLLAMA_TEMPERATURE = 0.3;
export const OLLAMA_TOP_P = 0.9;
export const OLLAMA_TIMEOUT_MS = 60000;
export const OLLAMA_MAX_TOKENS = 512;

// ─── Memory ───────────────────────────────────────────────────────────────────
export const MAX_CHAT_HISTORY = 10;
export const MAX_HISTORY_TOKENS = 1024;

// ─── Polling ──────────────────────────────────────────────────────────────────
export const SCRAPE_JOB_POLL_INTERVAL_MS = 2000;

// ─── Error Codes ──────────────────────────────────────────────────────────────
export const ERROR_CODES = {
  INVALID_URL: 'E_INVALID_URL',
  INVALID_INPUT: 'E_INVALID_INPUT',
  TIMEOUT: 'E_TIMEOUT',
  RATE_LIMITED: 'E_RATE_LIMIT',
  CONNECTION_ERROR: 'E_CONNECTION',
  OLLAMA_OFFLINE: 'E_OLLAMA_OFFLINE',
  CHROMADB_ERROR: 'E_CHROMADB_ERROR',
  EMPTY_CONTENT: 'E_EMPTY_CONTENT',
  BLOCKED_BY_ROBOTS: 'E_ROBOTS_TXT',
  DUPLICATE_URL: 'E_DUPLICATE_URL',
  DATABASE_ERROR: 'E_DATABASE_ERROR',
  NOT_FOUND: 'E_NOT_FOUND',
  UNKNOWN: 'E_UNKNOWN',
};

// ─── Status Values ────────────────────────────────────────────────────────────
export const STATUS = {
  // Scrape job statuses
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',

  // Website statuses
  ACTIVE: 'active',
  ARCHIVED: 'archived',

  // Page statuses
  PAGE_QUEUED: 'queued',
  PAGE_CRAWLING: 'crawling',
  PAGE_PROCESSING: 'processing',
  PAGE_COMPLETE: 'complete',
  PAGE_FAILED: 'failed',
};

// ─── User-facing error recovery messages ──────────────────────────────────────
export const RECOVERY_MESSAGES = {
  [ERROR_CODES.INVALID_URL]: 'Please enter a valid URL starting with http:// or https://',
  [ERROR_CODES.TIMEOUT]: 'The request timed out. The website may be slow or unavailable.',
  [ERROR_CODES.RATE_LIMITED]: 'Rate limited. Please wait before trying again.',
  [ERROR_CODES.OLLAMA_OFFLINE]: 'The AI service is offline. Please ensure Ollama is running (ollama serve).',
  [ERROR_CODES.CHROMADB_ERROR]: 'The vector database is unavailable. Please ensure ChromaDB is running.',
  [ERROR_CODES.EMPTY_CONTENT]: 'No meaningful content was found on this page.',
  [ERROR_CODES.BLOCKED_BY_ROBOTS]: 'This website does not allow scraping (blocked by robots.txt).',
  [ERROR_CODES.DUPLICATE_URL]: 'This website has already been scraped. Use the existing knowledge base.',
  [ERROR_CODES.DATABASE_ERROR]: 'A database error occurred. Please try again.',
  [ERROR_CODES.UNKNOWN]: 'An unexpected error occurred. Please try again.',
};
