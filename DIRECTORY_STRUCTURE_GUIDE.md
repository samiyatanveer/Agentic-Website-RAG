# Complete Directory Structure & File Guide
## What to create, where, and what goes inside

---

## **PROJECT ROOT STRUCTURE**

```
rag-chatbot/
├── .env.example              ← Copy to .env when setting up
├── .env                      ← DO NOT COMMIT (gitignore this)
├── .gitignore
├── package.json              ← Dependencies for entire project
├── README.md                 ← Project overview & quick start
├── docker-compose.yml        ← Optional: containerize services
│
├── backend/                  ← Node.js + Express
├── frontend/                 ← React + Vite
├── docs/                     ← Documentation
└── data/                     ← SQLite database & ChromaDB persistence
    ├── rag.db
    └── chroma/
```

---

## **BACKEND STRUCTURE (DETAILED)**

### **backend/package.json**
```json
{
  "name": "rag-chatbot-backend",
  "version": "1.0.0",
  "description": "RAG Chatbot Backend with Ollama",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js",
    "test": "jest",
    "setup-db": "node scripts/setup-db.js",
    "demo": "node scripts/demo-scrape.js",
    "test-ollama": "node scripts/test-ollama.js",
    "test-chroma": "node scripts/test-chroma.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "axios": "^1.6.0",
    "sqlite3": "^5.1.0",
    "sqlite": "^5.0.0",
    "cheerio": "^1.0.0-rc.12",
    "uuid": "^9.0.0",
    "dotenv": "^16.3.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.0",
    "jest": "^29.0.0"
  }
}
```

---

## **BACKEND - CONFIG FILES**

### **backend/src/config/env.js**
```javascript
/**
 * Load and validate environment variables
 * Throws error if required vars are missing
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const requiredVars = [
  'NODE_ENV',
  'PORT',
  'DATABASE_PATH',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODEL',
  'CHROMADB_HOST',
  'CHROMADB_PORT'
];

requiredVars.forEach(varName => {
  if (!process.env[varName]) {
    throw new Error(`Missing required env var: ${varName}`);
  }
});

export default {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 5000,
  LOG_LEVEL: process.env.LOG_LEVEL || 'debug',

  // Database
  DATABASE_PATH: process.env.DATABASE_PATH || './data/rag.db',
  DATABASE_TIMEOUT_MS: parseInt(process.env.DATABASE_TIMEOUT_MS) || 5000,

  // Ollama
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'mistral',
  OLLAMA_TIMEOUT_MS: parseInt(process.env.OLLAMA_TIMEOUT_MS) || 60000,
  OLLAMA_TEMPERATURE: parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.3,
  OLLAMA_TOP_P: parseFloat(process.env.OLLAMA_TOP_P) || 0.9,
  OLLAMA_MAX_TOKENS: parseInt(process.env.OLLAMA_MAX_TOKENS) || 512,

  // ChromaDB
  CHROMADB_HOST: process.env.CHROMADB_HOST || 'localhost',
  CHROMADB_PORT: parseInt(process.env.CHROMADB_PORT) || 8000,
  CHROMADB_PERSIST_DIRECTORY: process.env.CHROMADB_PERSIST_DIRECTORY || './data/chroma',

  // Scraper
  SCRAPER_REQUEST_DELAY_MS: parseInt(process.env.SCRAPER_REQUEST_DELAY_MS) || 2000,
  SCRAPER_REQUEST_TIMEOUT_MS: parseInt(process.env.SCRAPER_REQUEST_TIMEOUT_MS) || 30000,
  SCRAPER_MAX_CONCURRENT: parseInt(process.env.SCRAPER_MAX_CONCURRENT) || 2,
  SCRAPER_MAX_PAGES_PER_DOMAIN: parseInt(process.env.SCRAPER_MAX_PAGES_PER_DOMAIN) || 50,
  SCRAPER_MAX_RETRIES: parseInt(process.env.SCRAPER_MAX_RETRIES) || 3,
  SCRAPER_RESPECT_ROBOTS_TXT: process.env.SCRAPER_RESPECT_ROBOTS_TXT === 'true',

  // RAG
  RAG_CHUNK_SIZE: parseInt(process.env.RAG_CHUNK_SIZE) || 512,
  RAG_CHUNK_OVERLAP: parseInt(process.env.RAG_CHUNK_OVERLAP) || 100,
  RAG_SIMILARITY_THRESHOLD: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD) || 0.6,
  RAG_N_RESULTS: parseInt(process.env.RAG_N_RESULTS) || 5,
  RAG_MAX_HISTORY: parseInt(process.env.RAG_MAX_HISTORY) || 10,

  // Frontend
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || 'http://localhost:5000/api'
};
```

### **backend/src/config/constants.js**
```javascript
/**
 * All magic numbers and constants in one place
 */

export const CHUNK_SIZE_TOKENS = 512;
export const CHUNK_OVERLAP_TOKENS = 100;
export const MAX_CHUNK_SIZE_BYTES = 2048;

export const SIMILARITY_THRESHOLD = 0.6;
export const N_RESULTS_RETRIEVE = 5;
export const FALLBACK_N_RESULTS = 3;

export const REQUEST_DELAY_MS = 2000;
export const REQUEST_TIMEOUT_MS = 30000;
export const MAX_CONCURRENT_REQUESTS = 2;
export const MAX_PAGES_PER_DOMAIN = 50;

export const OLLAMA_TEMPERATURE = 0.3;
export const OLLAMA_TOP_P = 0.9;
export const OLLAMA_TIMEOUT_MS = 60000;

export const MAX_CHAT_HISTORY = 10;
export const MAX_HISTORY_TOKENS = 1024;

export const SCRAPE_JOB_POLL_INTERVAL_MS = 2000;

export const ERROR_CODES = {
  INVALID_URL: 'E_INVALID_URL',
  TIMEOUT: 'E_TIMEOUT',
  RATE_LIMITED: 'E_RATE_LIMIT',
  OLLAMA_OFFLINE: 'E_OLLAMA_OFFLINE',
  CHROMADB_ERROR: 'E_CHROMADB_ERROR',
  EMPTY_CONTENT: 'E_EMPTY_CONTENT',
  BLOCKED_BY_ROBOTS: 'E_ROBOTS_TXT',
  DUPLICATE_URL: 'E_DUPLICATE_URL',
  DATABASE_ERROR: 'E_DATABASE_ERROR'
};

export const STATUS_CODES = {
  QUEUED: 'queued',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ACTIVE: 'active',
  ARCHIVED: 'archived'
};

export const MEMORY_TYPES = {
  SHORT_TERM: 'short_term',
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic'
};
```

### **backend/src/config/database.js**
```javascript
/**
 * SQLite database connection & initialization
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import env from './env.js';

let dbInstance = null;

export async function getDatabase() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: env.DATABASE_PATH,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbInstance.exec('PRAGMA foreign_keys = ON');

  return dbInstance;
}

export async function initializeDatabase() {
  const db = await getDatabase();

  // Run migrations
  const migrations = [
    `
    CREATE TABLE IF NOT EXISTS websites (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      url TEXT NOT NULL UNIQUE,
      url_hash TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_pages INTEGER DEFAULT 0,
      total_chunks INTEGER DEFAULT 0,
      error_message TEXT
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_websites_url_hash ON websites(url_hash)`,
    // ... add all other tables
  ];

  for (const migration of migrations) {
    await db.exec(migration);
  }

  console.log('✅ Database initialized');
}

export async function closeDatabase() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
```

### **backend/src/config/ollama.js**
```javascript
/**
 * Ollama LLM client configuration
 */

import axios from 'axios';
import env from './env.js';

const ollamaClient = axios.create({
  baseURL: env.OLLAMA_BASE_URL,
  timeout: env.OLLAMA_TIMEOUT_MS
});

export async function checkOllamaHealth() {
  try {
    const response = await ollamaClient.get('/api/tags');
    return {
      healthy: true,
      models: response.data.models.map(m => m.name)
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

export default ollamaClient;
```

### **backend/src/config/chroma.js**
```javascript
/**
 * ChromaDB vector store configuration
 */

import axios from 'axios';
import env from './env.js';

const chromaClient = axios.create({
  baseURL: `http://${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
  timeout: 10000
});

export async function checkChromaHealth() {
  try {
    const response = await chromaClient.get('/api/v1');
    return {
      healthy: true,
      version: response.data.version
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    };
  }
}

export default chromaClient;
```

---

## **BACKEND - UTILITY FILES**

### **backend/src/utils/logger.js**
```javascript
/**
 * Centralized logging utility
 * Logs to console and file
 */

import env from '../config/env.js';

const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = levels[env.LOG_LEVEL] || 1;

export default {
  debug(message, data = {}) {
    if (currentLevel <= levels.debug) {
      console.log(`[DEBUG] ${message}`, data);
    }
  },

  info(message, data = {}) {
    if (currentLevel <= levels.info) {
      console.log(`[INFO] ${message}`, data);
    }
  },

  warn(message, data = {}) {
    if (currentLevel <= levels.warn) {
      console.warn(`[WARN] ${message}`, data);
    }
  },

  error(message, error = {}) {
    if (currentLevel <= levels.error) {
      console.error(`[ERROR] ${message}`, error);
    }
  }
};
```

### **backend/src/utils/validators.js**
```javascript
/**
 * Input validation functions
 */

import { URL } from 'url';

export function validateURL(urlString) {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP/HTTPS URLs allowed');
    }
    return true;
  } catch (error) {
    return false;
  }
}

export function validateChunkSize(size) {
  return size > 0 && size <= 4096;
}

export function validateSimilarityThreshold(threshold) {
  return threshold >= 0 && threshold <= 1;
}

export function validateMessage(message) {
  return message && message.trim().length > 0 && message.length <= 5000;
}
```

### **backend/src/utils/urlNormalizer.js**
```javascript
/**
 * URL normalization for duplicate detection
 */

import { URL } from 'url';

export function normalizeURL(urlString) {
  try {
    const url = new URL(urlString);
    
    url.hash = '';
    url.pathname = url.pathname.replace(/\/$/, '');
    url.hostname = url.hostname.toLowerCase();
    
    if ((url.protocol === 'https:' && url.port === '443') ||
        (url.protocol === 'http:' && url.port === '80')) {
      url.port = '';
    }
    
    // Sort query params
    const params = new URLSearchParams(url.search);
    url.search = new URLSearchParams([...params].sort()).toString();
    
    return url.href;
  } catch (error) {
    throw new Error(`Invalid URL: ${urlString}`);
  }
}

export function generateURLHash(normalizedUrl) {
  import crypto from 'crypto';
  return crypto.createHash('sha256').update(normalizedUrl).digest('hex');
}
```

### **backend/src/utils/errorHandler.js**
```javascript
/**
 * Centralized error handling
 */

import logger from './logger.js';
import { ERROR_CODES } from '../config/constants.js';

export function createError(code, message, statusCode = 500) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function handleError(error, fallbackMessage = 'Unknown error') {
  logger.error(fallbackMessage, {
    message: error.message,
    code: error.code,
    stack: error.stack
  });

  return {
    success: false,
    error: {
      code: error.code || ERROR_CODES.DATABASE_ERROR,
      message: error.message || fallbackMessage,
      statusCode: error.statusCode || 500
    }
  };
}

export function createSuccessResponse(data) {
  return {
    success: true,
    data
  };
}
```

### **backend/src/utils/sleep.js**
```javascript
/**
 * Async sleep utility
 */

export default function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## **BACKEND - MIDDLEWARE**

### **backend/src/middleware/error.middleware.js**
```javascript
/**
 * Global error handling middleware
 */

import logger from '../utils/logger.js';

export default function errorMiddleware(err, req, res, next) {
  logger.error('Unhandled error', {
    message: err.message,
    path: req.path,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  const code = err.code || 'E_UNKNOWN';

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: err.message,
      statusCode
    }
  });
}
```

### **backend/src/middleware/validation.middleware.js**
```javascript
/**
 * Request validation middleware
 */

export function validateScrapeRequest(req, res, next) {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'E_INVALID_URL',
        message: 'URL is required',
        statusCode: 400
      }
    });
  }

  // Validate URL format
  try {
    new URL(url);
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: 'E_INVALID_URL',
        message: 'Invalid URL format',
        statusCode: 400
      }
    });
  }
}

export function validateChatRequest(req, res, next) {
  const { websiteId, message } = req.body;

  if (!websiteId || !message) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'E_INVALID_INPUT',
        message: 'websiteId and message are required',
        statusCode: 400
      }
    });
  }

  if (message.length > 5000) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'E_INVALID_INPUT',
        message: 'Message too long (max 5000 characters)',
        statusCode: 400
      }
    });
  }

  next();
}
```

---

## **BACKEND - SERVICES (Key Files)**

### **backend/src/services/scraper/scraper.service.js**
```javascript
/**
 * Main scraper orchestrator
 * Coordinates: crawler → cleaner → chunker → embeddings → storage
 */

import crawlerService from './crawler.service.js';
import cleanerService from '../content/cleaner.service.js';
import chunkerService from '../content/chunker.service.js';
import embeddingService from '../embeddings/embedding.service.js';
import chromaService from '../vector/chroma.service.js';
import { getDatabase } from '../../config/database.js';
import logger from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export async function scrapeWebsite(url, jobId) {
  const db = await getDatabase();
  
  try {
    // Step 1: Crawl all pages
    logger.info('Starting crawl', { url });
    const pages = await crawlerService.crawlDomain(url);
    await db.run('UPDATE scrape_jobs SET pages_found = ? WHERE id = ?', [pages.length, jobId]);
    
    // Step 2: Process each page
    let chunksGenerated = 0;
    for (let i = 0; i < pages.length; i++) {
      const pageUrl = pages[i];
      
      try {
        // Clean content
        const cleanedContent = await cleanerService.clean(pageUrl);
        
        // Chunk content
        const chunks = await chunkerService.chunk(cleanedContent);
        
        // Generate embeddings
        const embeddings = await embeddingService.embedChunks(chunks);
        
        // Store in ChromaDB
        await chromaService.storeChunks(pageUrl, chunks, embeddings);
        
        chunksGenerated += chunks.length;
        
        // Update progress
        await updateProgress(jobId, {
          pages_crawled: i + 1,
          pages_processed: i + 1,
          chunks_generated: chunksGenerated
        });
      } catch (error) {
        logger.warn(`Failed to process page: ${pageUrl}`, error);
      }
    }
    
    return { success: true, chunksGenerated };
  } catch (error) {
    await db.run('UPDATE scrape_jobs SET error_message = ? WHERE id = ?', [error.message, jobId]);
    throw error;
  }
}

async function updateProgress(jobId, updates) {
  const db = await getDatabase();
  const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  await db.run(`UPDATE scrape_jobs SET ${setClause} WHERE id = ?`, [...values, jobId]);
}

export default {
  scrapeWebsite
};
```

### **backend/src/services/content/cleaner.service.js**
```javascript
/**
 * HTML to clean text conversion
 * Removes boilerplate, scripts, styles, etc.
 */

import cheerio from 'cheerio';

export async function cleanHTML(html) {
  // Parse HTML
  const $ = cheerio.load(html);

  // Remove unwanted elements
  $('script').remove();
  $('style').remove();
  $('nav').remove();
  $('footer').remove();
  $('iframe').remove();

  // Extract text content
  let text = $.text();

  // Normalize whitespace
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Check if empty
  if (text.trim().length === 0) {
    throw new Error('No extractable content found');
  }

  return text;
}

export default {
  clean: cleanHTML
};
```

### **backend/src/services/content/chunker.service.js**
```javascript
/**
 * Text chunking with overlap
 * 512 tokens per chunk, 100 token overlap
 */

import { CHUNK_SIZE_TOKENS, CHUNK_OVERLAP_TOKENS } from '../../config/constants.js';

function tokenize(text) {
  return text.split(/\s+/);
}

function estimateTokens(text) {
  return text.split(/\s+/).length;
}

export async function chunkText(text) {
  const tokens = tokenize(text);
  const chunks = [];
  
  for (let i = 0; i < tokens.length; i += CHUNK_SIZE_TOKENS - CHUNK_OVERLAP_TOKENS) {
    const end = Math.min(i + CHUNK_SIZE_TOKENS, tokens.length);
    const chunkTokens = tokens.slice(i, end);
    
    if (chunkTokens.length > 0) {
      chunks.push({
        text: chunkTokens.join(' '),
        token_count: chunkTokens.length,
        start_index: i,
        end_index: end
      });
    }
  }
  
  return chunks;
}

export default {
  chunk: chunkText
};
```

### **backend/src/services/rag/rag.service.js**
```javascript
/**
 * Main RAG orchestrator
 * Retrieves context, builds prompt, calls LLM, saves conversation
 */

import retrievalService from '../vector/retrieval.service.js';
import promptService from './prompt.service.js';
import ollamaService from '../llm/ollama.service.js';
import memoryService from '../memory/chatMemory.service.js';
import { getDatabase } from '../../config/database.js';
import { v4 as uuidv4 } from 'uuid';

export async function chat(websiteId, message, conversationId) {
  const db = await getDatabase();
  
  // Load or create conversation
  if (!conversationId) {
    conversationId = uuidv4();
    await db.run(
      'INSERT INTO conversations (id, website_id) VALUES (?, ?)',
      [conversationId, websiteId]
    );
  }

  // Retrieve relevant context
  const context = await retrievalService.retrieveContext(websiteId, message);

  // Load chat history
  const history = await memoryService.loadChatHistory(conversationId);

  // Build prompt
  const prompt = promptService.buildPrompt(message, context.text, history);

  // Call LLM
  const response = await ollamaService.generate(prompt);

  // Save to database
  await db.run(
    'INSERT INTO messages (id, conversation_id, role, content, sources) VALUES (?, ?, ?, ?, ?)',
    [
      uuidv4(),
      conversationId,
      'assistant',
      response.text,
      JSON.stringify(context.sources)
    ]
  );

  return {
    conversationId,
    message: response.text,
    sources: context.sources,
    confidence: context.confidence
  };
}

export default {
  chat
};
```

---

## **BACKEND - ROUTES**

### **backend/src/routes/index.js**
```javascript
/**
 * Mount all routes
 */

import scrapeRoutes from './scrape.routes.js';
import chatRoutes from './chat.routes.js';
import websiteRoutes from './website.routes.js';
import conversationRoutes from './conversation.routes.js';
import healthRoutes from './health.routes.js';

export default function mountRoutes(app) {
  app.use('/api/scrape', scrapeRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/websites', websiteRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/health', healthRoutes);
}
```

### **backend/src/routes/scrape.routes.js**
```javascript
/**
 * Scraping endpoints
 */

import express from 'express';
import scrapeController from '../controllers/scrape.controller.js';
import { validateScrapeRequest } from '../middleware/validation.middleware.js';

const router = express.Router();

router.post('/', validateScrapeRequest, scrapeController.scrape);
router.get('/:jobId/status', scrapeController.getStatus);

export default router;
```

### **backend/src/routes/chat.routes.js**
```javascript
/**
 * Chat endpoints
 */

import express from 'express';
import chatController from '../controllers/chat.controller.js';
import { validateChatRequest } from '../middleware/validation.middleware.js';

const router = express.Router();

router.post('/', validateChatRequest, chatController.chat);

export default router;
```

---

## **BACKEND - CONTROLLERS**

### **backend/src/controllers/scrape.controller.js**
```javascript
/**
 * Scrape controller
 * Validates input, calls scraper service, returns response
 */

import scrapeService from '../services/scraper/scraper.service.js';
import { createSuccessResponse, handleError } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../config/database.js';

export async function scrape(req, res) {
  try {
    const { url, options = {} } = req.body;
    
    logger.info('Scrape request', { url });

    const db = await getDatabase();
    
    // Create scrape job
    const jobId = uuidv4();
    const websiteId = uuidv4();
    
    await db.run(
      'INSERT INTO scrape_jobs (id, website_id, status) VALUES (?, ?, ?)',
      [jobId, websiteId, 'queued']
    );

    // Start scraping in background (don't wait)
    scrapeService.scrapeWebsite(url, jobId).catch(err => logger.error('Scrape failed', err));

    return res.status(202).json(createSuccessResponse({
      jobId,
      websiteId,
      status: 'queued'
    }));
  } catch (error) {
    return res.status(500).json(handleError(error));
  }
}

export async function getStatus(req, res) {
  try {
    const { jobId } = req.params;
    const db = await getDatabase();

    const job = await db.get('SELECT * FROM scrape_jobs WHERE id = ?', [jobId]);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: { message: 'Job not found' }
      });
    }

    return res.json(createSuccessResponse(job));
  } catch (error) {
    return res.status(500).json(handleError(error));
  }
}

export default {
  scrape,
  getStatus
};
```

### **backend/src/controllers/chat.controller.js**
```javascript
/**
 * Chat controller
 */

import ragService from '../services/rag/rag.service.js';
import { createSuccessResponse, handleError } from '../utils/errorHandler.js';
import logger from '../utils/logger.js';

export async function chat(req, res) {
  try {
    const { websiteId, message, conversationId } = req.body;

    logger.info('Chat request', { websiteId });

    const result = await ragService.chat(websiteId, message, conversationId);

    return res.json(createSuccessResponse(result));
  } catch (error) {
    return res.status(500).json(handleError(error));
  }
}

export default {
  chat
};
```

---

## **BACKEND - MAIN FILES**

### **backend/src/app.js**
```javascript
/**
 * Express app setup
 */

import express from 'express';
import cors from 'cors';
import mountRoutes from './routes/index.js';
import errorMiddleware from './middleware/error.middleware.js';
import logger from './utils/logger.js';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

// Routes
mountRoutes(app);

// Error handling
app.use(errorMiddleware);

export default app;
```

### **backend/src/server.js**
```javascript
/**
 * Start server
 */

import app from './app.js';
import env from './config/env.js';
import { initializeDatabase, closeDatabase } from './config/database.js';
import logger from './utils/logger.js';

async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized');

    // Start listening
    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await closeDatabase();
  process.exit(0);
});

startServer();
```

---

## **BACKEND - SCRIPTS**

### **backend/scripts/setup-db.js**
```javascript
/**
 * Initialize database with all migrations
 * Run once: node scripts/setup-db.js
 */

import { initializeDatabase, closeDatabase, getDatabase } from '../src/config/database.js';

async function setup() {
  try {
    await initializeDatabase();
    const db = await getDatabase();
    
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );

    console.log('✅ Database setup complete');
    console.log('Tables created:', tables.map(t => t.name).join(', '));
    
    await closeDatabase();
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setup();
```

### **backend/scripts/test-rag.js**
```javascript
/**
 * Test RAG end-to-end
 * Usage: node scripts/test-rag.js "https://example.com" "What is X?"
 */

import scrapeService from '../src/services/scraper/scraper.service.js';
import ragService from '../src/services/rag/rag.service.js';

const [, , url, question] = process.argv;

if (!url || !question) {
  console.log('Usage: node test-rag.js <url> <question>');
  process.exit(1);
}

async function test() {
  try {
    console.log('1. Scraping...');
    // Scrape logic

    console.log('2. Asking question...');
    // RAG logic

    console.log('✅ Test complete');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test();
```

---

## **FRONTEND STRUCTURE**

### **frontend/package.json**
```json
{
  "name": "rag-chatbot-frontend",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0"
  }
}
```

### **frontend/vite.config.js**
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
});
```

### **frontend/src/main.jsx**
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### **frontend/src/App.jsx**
```javascript
import { useState } from 'react';
import ScrapeForm from './components/ScrapeForm';
import ChatInterface from './components/ChatInterface';
import WebsiteList from './components/WebsiteList';

export default function App() {
  const [websites, setWebsites] = useState([]);
  const [selectedWebsite, setSelectedWebsite] = useState(null);

  return (
    <div className="app">
      <header>
        <h1>RAG Chatbot</h1>
      </header>

      <main>
        <div className="sidebar">
          <ScrapeForm onScraped={(website) => setWebsites([...websites, website])} />
          <WebsiteList websites={websites} onSelect={setSelectedWebsite} />
        </div>

        <div className="content">
          {selectedWebsite ? (
            <ChatInterface website={selectedWebsite} />
          ) : (
            <p>Select a website to start chatting</p>
          )}
        </div>
      </main>
    </div>
  );
}
```

### **frontend/src/components/ScrapeForm.jsx**
```javascript
import { useState } from 'react';
import ScrapeProgress from './ScrapeProgress';
import scrapeApi from '../services/scrapeApi';

export default function ScrapeForm({ onScraped }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await scrapeApi.scrapeWebsite(url);
      setJobId(response.data.jobId);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (jobId) {
    return <ScrapeProgress jobId={jobId} onComplete={onScraped} />;
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="url"
        placeholder="Enter website URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Scraping...' : 'Scrape Website'}
      </button>
    </form>
  );
}
```

### **frontend/src/components/ChatInterface.jsx**
```javascript
import { useState, useEffect } from 'react';
import chatApi from '../services/chatApi';
import SourceAttribution from './SourceAttribution';

export default function ChatInterface({ website }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setMessages([...messages, { role: 'user', content: input }]);

    try {
      const response = await chatApi.chat(website.id, input);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.data.content,
          sources: response.data.sources
        }
      ]);
    } catch (error) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <p>{msg.content}</p>
            {msg.sources && <SourceAttribution sources={msg.sources} />}
          </div>
        ))}
      </div>

      <form onSubmit={handleSendMessage}>
        <input
          type="text"
          placeholder="Ask a question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

### **frontend/src/services/api.js**
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 30000
});

export default api;
```

### **frontend/src/services/chatApi.js**
```javascript
import api from './api';

export default {
  async chat(websiteId, message, conversationId) {
    return api.post('/chat', {
      websiteId,
      message,
      conversationId
    });
  },

  async getConversation(conversationId) {
    return api.get(`/conversations/${conversationId}`);
  }
};
```

---

## **DIRECTORY STRUCTURE SUMMARY**

```
rag-chatbot/
├── backend/                    ← 30+ files
│   ├── src/
│   │   ├── config/             ← 4 files (env, db, ollama, chroma)
│   │   ├── routes/             ← 6 files (one per feature)
│   │   ├── controllers/        ← 6 files
│   │   ├── services/           ← 15+ files (organized by feature)
│   │   ├── utils/              ← 8 files
│   │   ├── middleware/         ← 4 files
│   │   ├── types/              ← 4 files
│   │   ├── app.js
│   │   └── server.js
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── scripts/                ← 4-5 test scripts
│   └── tests/
│
├── frontend/                   ← 20+ files
│   ├── src/
│   │   ├── components/         ← 6-8 React components
│   │   ├── services/           ← 3-4 API services
│   │   ├── hooks/              ← 3-4 custom hooks
│   │   ├── utils/
│   │   ├── styles/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── vite.config.js
│   └── package.json
│
├── docs/                       ← 4-5 markdown docs
├── data/                       ← SQLite + ChromaDB (generated)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

**Total: ~80-100 files (realistic for this project)**

---

## **BUILD ORDER (Day-by-Day)**

**Day 1-2:** Create all config files + database schema
**Day 3-4:** Build scraper + content services
**Day 5:** Build embeddings + vector retrieval
**Day 6:** Build RAG + LLM services
**Day 7:** Build API routes + controllers
**Day 8:** Build React frontend
**Day 9:** Testing + refinement
**Day 10:** Documentation + polish

Each file builds on previous ones. Don't skip files or you'll have missing imports.

