# Website Scraper + Local LLM RAG Chatbot - PRODUCTION READY ARCHITECTURE
## Complete Implementation Specification

---

## **1. SYSTEM OVERVIEW**

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  Vite + TypeScript                                              │
│  ├─ URL input with validation                                  │
│  ├─ Loading states + progress tracking                         │
│  ├─ Chat interface with source attribution                     │
│  └─ Conversation history display                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTP/REST API
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND (Node.js + Express)                   │
│                                                                  │
│  ┌─────────────────┐  ┌──────────────┐  ┌────────────────────┐ │
│  │ Routes Layer    │  │ Controllers  │  │ Services Layer     │ │
│  ├─ scrape.routes │  │              │  ├─ scraper.service  │ │
│  ├─ chat.routes   │  │ (validation) │  ├─ cleaner.service  │ │
│  ├─ website.routes│  │ (response)   │  ├─ chunker.service  │ │
│  └─ conv.routes   │  │ (formatting) │  ├─ embedding.svc    │ │
│                   │  │              │  ├─ chroma.service   │ │
│                   │  │              │  ├─ rag.service      │ │
│                   │  │              │  ├─ ollama.service   │ │
│                   │  │              │  ├─ memory.service   │ │
│                   │  │              │  └─ history.service  │ │
│                   │  │              │                       │ │
│                   │  └──────────────┘  └────────────────────┘ │
│                   │                            │               │
│                   ▼                            ▼               │
│        ┌──────────────────────────────────────────────┐       │
│        │         Database Layer (SQLite)              │       │
│        │ ├─ websites table (metadata)                │       │
│        │ ├─ pages table (chunked content)            │       │
│        │ ├─ chunks table (individual chunks)         │       │
│        │ ├─ conversations table (chat history)       │       │
│        │ ├─ messages table (individual messages)     │       │
│        │ └─ scrape_jobs table (progress tracking)    │       │
│        └──────────────────────────────────────────────┘       │
└────────────────────┬────────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┬─────────────┐
        ▼            ▼            ▼             ▼
    ┌───────┐  ┌─────────┐  ┌──────────┐  ┌────────────┐
    │ Ollama│  │ChromaDB │  │Cheerio   │  │ Puppeteer  │
    │ (LLM) │  │(Vectors)│  │(Static)  │  │ (Dynamic)  │
    └───────┘  └─────────┘  └──────────┘  └────────────┘
```

---

## **2. CRITICAL IMPLEMENTATION DETAILS**

### **2.1 Chunking Strategy**

```javascript
// EXACT SPECIFICATION:
CHUNK_SIZE = 512 tokens per chunk
CHUNK_OVERLAP = 100 tokens (19.5% overlap)
MAX_CHUNK_SIZE_BYTES = 2048 bytes (safety limit)

// Why these values?
// - 512 tokens ≈ 2000 characters (balance between granularity + context)
// - 100 token overlap ensures concepts spanning chunk boundaries stay connected
// - Example: "gradient descent" concept won't be split awkwardly

// Implementation
const tokenize = (text) => text.split(/\s+/);
const chunk = (tokens, size = 512, overlap = 100) => {
    const chunks = [];
    for (let i = 0; i < tokens.length; i += size - overlap) {
        chunks.push(tokens.slice(i, i + size).join(' '));
    }
    return chunks;
};
```

### **2.2 RAG Retrieval & Grounding**

```javascript
// RETRIEVAL SPECIFICATION:
SIMILARITY_THRESHOLD = 0.6    // Cosine similarity minimum
N_RESULTS = 5                 // Top-5 most similar chunks
FALLBACK_N_RESULTS = 3        // If < threshold, include next 3
MAX_CONTEXT_LENGTH = 2048     // Max tokens for context window

// Query flow
1. Generate embedding for user question (via Ollama)
2. Query ChromaDB with similarity_fn = "cosine"
3. Retrieve top 5 results with metadata (source URL, page)
4. Filter: keep only results > 0.6 similarity
5. If < 3 results pass threshold:
   - Include next closest results until 3+ are included
   - Mark lower-confidence results in UI
6. Build grounded prompt with retrieved context
7. Pass to Ollama for generation

// PROMPT TEMPLATE (CRITICAL):
const buildPrompt = (question, context, conversationHistory) => `
You are a helpful assistant that answers questions based ONLY on the provided context.
You are truthful and admit when you don't know something.

CONTEXT (from scraped websites):
${context}

CONVERSATION HISTORY:
${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}

USER QUESTION: ${question}

IMPORTANT:
1. Answer based ONLY on the context provided above
2. If the context doesn't contain the answer, say: "I don't have that information in the provided context"
3. Cite which source chunk informed your answer
4. Do not make up information
5. Keep answers concise (2-3 sentences max)

ANSWER:
`;
```

### **2.3 Similarity Threshold Decision Logic**

```javascript
async function retrieveContext(questionEmbedding, convId) {
    // Try to get top 5
    let results = await chromadb.query({
        embedding: questionEmbedding,
        n_results: 5,
        where: { conversation_id: convId }
    });

    // Filter by threshold (0.6)
    let qualityResults = results.filter(r => r.distance >= 0.6);

    if (qualityResults.length < 3) {
        // Not enough high-quality results
        if (qualityResults.length === 0) {
            return {
                context: "No relevant information found",
                sources: [],
                confidence: "low",
                fallback: true
            };
        }
        // Include some lower-confidence results
        qualityResults = results.slice(0, 3);
        return {
            context: formatContext(qualityResults),
            sources: extractSources(qualityResults),
            confidence: "medium",
            fallback: false
        };
    }

    return {
        context: formatContext(qualityResults),
        sources: extractSources(qualityResults),
        confidence: "high",
        fallback: false
    };
}
```

### **2.4 Ollama Configuration**

```javascript
// OLLAMA SPECIFICATION FOR MVP:

MODEL_NAME = "mistral"           // Mistral 7B (best free option)
MODEL_SIZE = ~4GB disk space     // Requires sufficient disk
CONTEXT_WINDOW = 2048 tokens     // Max context length
MAX_TOKENS_RESPONSE = 512        // Max response length
TEMPERATURE = 0.3                // Lower = more consistent
TOP_P = 0.9                      // Diversity

// Installation:
// 1. Download Ollama from ollama.ai
// 2. ollama pull mistral
// 3. ollama serve (runs on localhost:11434)

// API Endpoint:
POST http://localhost:11434/api/generate
{
    "model": "mistral",
    "prompt": "...",
    "stream": false,
    "temperature": 0.3,
    "top_p": 0.9
}

// ERROR HANDLING:
if (ollamaNotRunning) {
    return {
        error: "LLM service unavailable. Please ensure Ollama is running.",
        code: "OLLAMA_OFFLINE",
        recovery: "Check if 'ollama serve' is running"
    };
}

// MEMORY MANAGEMENT:
const MAX_CHAT_HISTORY = 10;     // Keep only last 10 messages
const MAX_HISTORY_TOKENS = 1024; // Max tokens for history

function trimChatHistory(messages) {
    // Keep only last MAX_CHAT_HISTORY messages
    let trimmed = messages.slice(-MAX_CHAT_HISTORY);
    
    // Calculate token count
    let tokenCount = 0;
    let result = [];
    
    for (let msg of trimmed) {
        let msgTokens = estimateTokens(msg.content);
        if (tokenCount + msgTokens < MAX_HISTORY_TOKENS) {
            result.push(msg);
            tokenCount += msgTokens;
        }
    }
    
    return result;
}
```

### **2.5 Rate Limiting & Ethical Scraping**

```javascript
// RATE LIMITING SPECIFICATION:

const SCRAPE_CONFIG = {
    REQUEST_DELAY_MS: 2000,          // 2 seconds between requests
    MAX_PAGES_PER_DOMAIN: 50,        // Max pages per website
    REQUEST_TIMEOUT_MS: 30000,       // 30 second timeout per page
    MAX_CONCURRENT_REQUESTS: 2,      // Only 2 parallel requests
    USER_AGENT: "MyRAGBot/1.0 (Learning Project; +https://yoursite.com/bot)"
};

// ROBOTS.TXT CHECKING:
async function canScrapeURL(url) {
    try {
        const parsed = new URL(url);
        const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;
        
        const response = await fetch(robotsUrl, { 
            timeout: 5000 
        });
        
        if (!response.ok) {
            // No robots.txt = assume OK
            return true;
        }
        
        const robotsTxt = await response.text();
        
        // Parse robots.txt for User-Agent: *
        const rules = parseRobotsTxt(robotsTxt);
        const userAgent = SCRAPE_CONFIG.USER_AGENT.split('/')[0];
        
        // Check if our bot is disallowed
        if (isDisallowed(rules, parsed.pathname, userAgent)) {
            return false;
        }
        
        // Honor Crawl-Delay
        const delay = extractCrawlDelay(rules, userAgent);
        if (delay) {
            SCRAPE_CONFIG.REQUEST_DELAY_MS = Math.max(
                SCRAPE_CONFIG.REQUEST_DELAY_MS,
                delay * 1000
            );
        }
        
        return true;
    } catch (e) {
        // If error reading robots.txt, allow scraping
        console.warn(`robots.txt check failed for ${url}: ${e.message}`);
        return true;
    }
}

// IMPLEMENTATION:
async function crawlWithRateLimit(urls) {
    const queue = urls.map(url => ({ url, retries: 0 }));
    const results = [];
    const inProgress = new Set();

    while (queue.length > 0 || inProgress.size > 0) {
        // Start up to MAX_CONCURRENT_REQUESTS
        while (inProgress.size < SCRAPE_CONFIG.MAX_CONCURRENT_REQUESTS && 
               queue.length > 0) {
            const job = queue.shift();
            inProgress.add(job);

            crawlOneURL(job).then(result => {
                results.push(result);
                inProgress.delete(job);
            }).catch(err => {
                // Retry logic
                if (job.retries < 3) {
                    job.retries++;
                    queue.push(job); // Re-queue
                } else {
                    results.push({ url: job.url, error: err.message });
                    inProgress.delete(job);
                }
            });

            // Wait before starting next request
            await sleep(SCRAPE_CONFIG.REQUEST_DELAY_MS);
        }

        // Wait for at least one to complete
        if (inProgress.size > 0) {
            await Promise.race([...inProgress].map(j => j.promise));
        }
    }

    return results;
}
```

### **2.6 Duplicate Detection Strategy**

```javascript
// URL NORMALIZATION:
function normalizeURL(urlString) {
    try {
        const url = new URL(urlString);
        
        // Remove fragment (#section)
        url.hash = '';
        
        // Remove trailing slash
        url.pathname = url.pathname.replace(/\/$/, '');
        
        // Lowercase domain
        url.hostname = url.hostname.toLowerCase();
        
        // Remove default ports
        if ((url.protocol === 'https:' && url.port === '443') ||
            (url.protocol === 'http:' && url.port === '80')) {
            url.port = '';
        }
        
        // Sort query parameters for consistency
        const params = new URLSearchParams(url.search);
        url.search = new URLSearchParams([...params].sort()).toString();
        
        return url.href;
    } catch (e) {
        throw new Error(`Invalid URL: ${urlString}`);
    }
}

// DUPLICATE CHECK:
async function checkDuplicate(urlString) {
    const normalized = normalizeURL(urlString);
    const urlHash = crypto.createHash('sha256').update(normalized).digest('hex');
    
    const existing = await db.query(
        'SELECT id, website_id FROM websites WHERE url_hash = ?',
        [urlHash]
    );
    
    if (existing.length > 0) {
        return {
            isDuplicate: true,
            existingId: existing[0].website_id,
            message: "This website has already been scraped"
        };
    }
    
    return { isDuplicate: false };
}

// CONTENT-BASED DUPLICATE (for page updates):
async function hasContentChanged(pageUrl, newContent) {
    const contentHash = crypto.createHash('sha256').update(newContent).digest('hex');
    
    const existing = await db.query(
        'SELECT content_hash, chunks_count FROM pages WHERE url = ?',
        [pageUrl]
    );
    
    if (existing.length > 0 && existing[0].content_hash === contentHash) {
        return {
            changed: false,
            message: "Content is identical to last scrape",
            shouldReEmbed: false
        };
    }
    
    return {
        changed: true,
        newHash: contentHash,
        shouldReEmbed: true
    };
}

// STRATEGY:
// 1. Before scraping: check URL hash → if exists, skip
// 2. After scraping: check content hash → if changed, re-embed
// 3. Store both hashes in DB for future reference
```

### **2.7 Error Handling & Recovery**

```javascript
// ERROR CLASSIFICATION:

const ErrorTypes = {
    // Network errors (retriable)
    TIMEOUT: { code: 'E_TIMEOUT', retryable: true, maxRetries: 3 },
    RATE_LIMITED: { code: 'E_RATE_LIMIT', retryable: true, maxRetries: 5 },
    CONNECTION_ERROR: { code: 'E_CONNECTION', retryable: true, maxRetries: 3 },
    
    // Service errors (check prerequisites)
    OLLAMA_OFFLINE: { code: 'E_OLLAMA_OFFLINE', retryable: false, recoveryMsg: "Ollama service not running" },
    CHROMADB_ERROR: { code: 'E_CHROMADB_ERROR', retryable: false, recoveryMsg: "Vector DB error" },
    
    // Bad input (don't retry)
    INVALID_URL: { code: 'E_INVALID_URL', retryable: false, recoveryMsg: "Invalid URL format" },
    INVALID_CHUNK_SIZE: { code: 'E_INVALID_CHUNK', retryable: false, recoveryMsg: "Chunk size out of bounds" },
    
    // Content errors
    EMPTY_CONTENT: { code: 'E_EMPTY_CONTENT', retryable: false, recoveryMsg: "No extractable content found" },
    BLOCKED_BY_ROBOTS: { code: 'E_ROBOTS_TXT', retryable: false, recoveryMsg: "Blocked by robots.txt" }
};

// RETRY STRATEGY:
async function withRetry(fn, maxRetries = 3, backoffMs = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            
            const errorType = ErrorTypes[error.code];
            if (!errorType || !errorType.retryable) {
                throw error; // Non-retriable error
            }
            
            if (attempt < maxRetries) {
                // Exponential backoff
                const delay = backoffMs * Math.pow(2, attempt - 1);
                console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms...`);
                await sleep(delay);
            }
        }
    }
    
    throw lastError;
}

// TRY-CATCH TEMPLATE FOR EVERY SERVICE:
async function someService(input) {
    try {
        // Validate input
        if (!input || !input.url) {
            throw { 
                code: 'E_INVALID_URL',
                message: 'URL is required',
                statusCode: 400 
            };
        }
        
        // Do work
        const result = await doSomething(input);
        
        return { success: true, data: result };
    } catch (error) {
        // Log for debugging
        logger.error('someService failed', {
            input,
            error: error.message,
            code: error.code,
            stack: error.stack
        });
        
        // Return structured error
        return {
            success: false,
            error: {
                code: error.code || 'E_UNKNOWN',
                message: error.message || 'Unknown error',
                statusCode: error.statusCode || 500,
                userMessage: ErrorTypes[error.code]?.recoveryMsg || 'Something went wrong'
            }
        };
    }
}
```

### **2.8 Progress Tracking for Long Scrapes**

```javascript
// SCRAPE JOB MODEL:
const scrapeJobSchema = {
    id: 'uuid',
    website_id: 'uuid',
    status: 'queued|in_progress|completed|failed',
    started_at: 'timestamp',
    completed_at: 'timestamp or null',
    
    // Progress
    pages_found: 'number',
    pages_crawled: 'number',
    pages_processed: 'number',
    chunks_generated: 'number',
    embeddings_stored: 'number',
    
    // Current state
    current_page_url: 'string or null',
    current_page_status: 'queued|crawling|processing|complete',
    
    // Errors
    error_count: 'number',
    last_error: 'string or null',
    
    // Estimates
    eta_seconds: 'number'
};

// UPDATE PROGRESS:
async function updateScrapeProgress(jobId, updates) {
    const job = await db.query('SELECT * FROM scrape_jobs WHERE id = ?', [jobId]);
    
    const updated = {
        ...job,
        ...updates,
        updated_at: new Date()
    };
    
    // Calculate ETA
    if (updated.pages_crawled > 0 && updated.pages_found > updated.pages_crawled) {
        const avgTimePerPage = (Date.now() - job.started_at) / updated.pages_crawled;
        const remainingPages = updated.pages_found - updated.pages_crawled;
        updated.eta_seconds = Math.ceil((remainingPages * avgTimePerPage) / 1000);
    }
    
    await db.query(
        'UPDATE scrape_jobs SET ? WHERE id = ?',
        [updated, jobId]
    );
    
    // Notify frontend (via polling endpoint or WebSocket)
    return updated;
}

// ENDPOINT:
GET /api/scrape/:jobId/status
Response: {
    status: "in_progress",
    pages_found: 47,
    pages_crawled: 12,
    pages_processed: 10,
    chunks_generated: 102,
    current_page: "https://example.com/about",
    eta_seconds: 35,
    progress_percent: 25.5
}
```

### **2.9 Content Cleaning Rules**

```javascript
// CLEANING STRATEGY:

async function cleanHTMLContent(html) {
    // Step 1: Remove script and style tags
    let content = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // Step 2: Convert tables to markdown
    content = convertTablesToMarkdown(content);
    
    // Step 3: Preserve code blocks
    const codeBlocks = [];
    content = content.replace(/<pre[^>]*>.*?<\/pre>/gs, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    // Step 4: Convert remaining HTML to text
    content = html2text(content);
    
    // Step 5: Restore code blocks
    codeBlocks.forEach((block, idx) => {
        content = content.replace(
            `__CODE_BLOCK_${idx}__`,
            html2text(block)
        );
    });
    
    // Step 6: Normalize whitespace
    content = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n');
    
    // Step 7: Remove boilerplate (navigation, footer, etc.)
    content = removeBoilerplate(content);
    
    // Step 8: Check if empty
    if (content.trim().length === 0) {
        throw {
            code: 'E_EMPTY_CONTENT',
            message: 'No extractable content found on page'
        };
    }
    
    return content;
}

// BOILERPLATE REMOVAL:
function removeBoilerplate(text) {
    const lines = text.split('\n');
    const footerKeywords = ['Copyright', 'Privacy', 'Terms', 'Follow us', 'Subscribe', 'Newsletter'];
    const navKeywords = ['Menu', 'Navigation', 'Home', 'About', 'Contact', 'Search'];
    
    // Remove lines that look like nav/footer
    return lines
        .filter(line => {
            const lower = line.toLowerCase();
            return !footerKeywords.some(kw => lower.includes(kw.toLowerCase())) &&
                   !navKeywords.some(kw => lower.includes(kw.toLowerCase()));
        })
        .join('\n');
}

// WHAT TO PRESERVE:
// ✅ Main content text
// ✅ Code blocks (for technical sites)
// ✅ Tables (convert to markdown)
// ✅ Lists (preserve with - or •)
// ❌ Navigation menus
// ❌ Footer/copyright
// ❌ Ads and tracking
// ❌ Form elements
```

### **2.10 Database Schema with Indexes**

```sql
-- Users & Websites
CREATE TABLE websites (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    url_hash TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    status TEXT DEFAULT 'active', -- active, archived, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_pages INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    error_message TEXT
);

CREATE INDEX idx_websites_user ON websites(user_id);
CREATE INDEX idx_websites_status ON websites(status);
CREATE INDEX idx_websites_url_hash ON websites(url_hash);

-- Pages
CREATE TABLE pages (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    content_hash TEXT,
    is_crawlable BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'complete', -- queued, crawling, processing, complete, failed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(website_id) REFERENCES websites(id)
);

CREATE INDEX idx_pages_website ON pages(website_id);
CREATE INDEX idx_pages_content_hash ON pages(content_hash);
CREATE UNIQUE INDEX idx_pages_url_website ON pages(url, website_id);

-- Chunks (Individual text chunks for embedding)
CREATE TABLE chunks (
    id TEXT PRIMARY KEY,
    page_id TEXT NOT NULL,
    website_id TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER,
    token_count INTEGER,
    is_embedded BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(page_id) REFERENCES pages(id),
    FOREIGN KEY(website_id) REFERENCES websites(id)
);

CREATE INDEX idx_chunks_page ON chunks(page_id);
CREATE INDEX idx_chunks_website ON chunks(website_id);
CREATE INDEX idx_chunks_is_embedded ON chunks(is_embedded);

-- Conversations & Messages
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    website_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    title TEXT,
    FOREIGN KEY(website_id) REFERENCES websites(id)
);

CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversations_website ON conversations(website_id);

CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT, -- 'user' or 'assistant'
    content TEXT NOT NULL,
    sources TEXT, -- JSON array of source chunks/URLs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Scrape Jobs (For progress tracking)
CREATE TABLE scrape_jobs (
    id TEXT PRIMARY KEY,
    website_id TEXT NOT NULL,
    status TEXT DEFAULT 'queued', -- queued, in_progress, completed, failed
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    pages_found INTEGER DEFAULT 0,
    pages_crawled INTEGER DEFAULT 0,
    pages_processed INTEGER DEFAULT 0,
    chunks_generated INTEGER DEFAULT 0,
    current_page_url TEXT,
    error_message TEXT,
    eta_seconds INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(website_id) REFERENCES websites(id)
);

CREATE INDEX idx_scrape_jobs_website ON scrape_jobs(website_id);
CREATE INDEX idx_scrape_jobs_status ON scrape_jobs(status);
```

---

## **3. COMPLETE DIRECTORY STRUCTURE**

```
project-root/
│
├── .env.example                 (Environment template - SEE BELOW)
├── .gitignore
├── package.json
├── README.md
│
├── backend/
│   ├── src/
│   │   ├── app.js                          (Express app setup)
│   │   ├── server.js                       (Start server)
│   │   │
│   │   ├── config/
│   │   │   ├── env.js                      (Load & validate env vars)
│   │   │   ├── database.js                 (SQLite connection)
│   │   │   ├── ollama.js                   (Ollama client config)
│   │   │   ├── chroma.js                   (ChromaDB client config)
│   │   │   └── constants.js                (All magic numbers)
│   │   │
│   │   ├── routes/
│   │   │   ├── scrape.routes.js            (POST /api/scrape, GET /api/scrape/:id/status)
│   │   │   ├── chat.routes.js              (POST /api/chat)
│   │   │   ├── website.routes.js           (GET /api/websites, GET /api/websites/:id, DELETE)
│   │   │   ├── conversation.routes.js      (GET /api/conversations/:id, DELETE)
│   │   │   ├── health.routes.js            (GET /api/health)
│   │   │   └── index.js                    (Mount all routes)
│   │   │
│   │   ├── controllers/
│   │   │   ├── scrape.controller.js
│   │   │   │   ├── POST /scrape (validate URL → call scraper service)
│   │   │   │   └── GET /scrape/:id/status (return progress)
│   │   │   │
│   │   │   ├── chat.controller.js
│   │   │   │   └── POST /chat (validate input → call RAG service)
│   │   │   │
│   │   │   ├── website.controller.js
│   │   │   │   ├── GET /websites (list all)
│   │   │   │   ├── GET /websites/:id (details + stats)
│   │   │   │   └── DELETE /websites/:id (cleanup)
│   │   │   │
│   │   │   ├── conversation.controller.js
│   │   │   │   ├── GET /conversations/:id (full chat history)
│   │   │   │   └── DELETE /conversations/:id (delete chat)
│   │   │   │
│   │   │   └── health.controller.js
│   │   │       └── GET /health (service status)
│   │   │
│   │   ├── services/
│   │   │   │
│   │   │   ├── scraper/
│   │   │   │   ├── scraper.service.js      (Main orchestrator)
│   │   │   │   ├── crawler.service.js      (Discovery: find all pages)
│   │   │   │   ├── cheerio.service.js      (Static HTML scraping)
│   │   │   │   ├── puppeteer.service.js    (JS-heavy site rendering - v2 feature)
│   │   │   │   └── validation.service.js   (robots.txt, rate limit checks)
│   │   │   │
│   │   │   ├── content/
│   │   │   │   ├── cleaner.service.js      (HTML → clean text)
│   │   │   │   ├── extractor.service.js    (Extract metadata, title, etc.)
│   │   │   │   └── chunker.service.js      (Split into chunks with overlap)
│   │   │   │
│   │   │   ├── embeddings/
│   │   │   │   └── embedding.service.js    (Generate embeddings via Ollama)
│   │   │   │
│   │   │   ├── vector/
│   │   │   │   ├── chroma.service.js       (Store & query ChromaDB)
│   │   │   │   └── retrieval.service.js    (RAG retrieval logic)
│   │   │   │
│   │   │   ├── rag/
│   │   │   │   ├── rag.service.js          (Main RAG orchestrator)
│   │   │   │   ├── prompt.service.js       (Build grounded prompts)
│   │   │   │   └── grounding.service.js    (Format retrieved context)
│   │   │   │
│   │   │   ├── llm/
│   │   │   │   └── ollama.service.js       (Ollama API wrapper)
│   │   │   │
│   │   │   ├── memory/
│   │   │   │   ├── chatMemory.service.js   (Load/trim chat history)
│   │   │   │   └── progressMemory.service.js (Track scrape progress)
│   │   │   │
│   │   │   └── database/
│   │   │       ├── website.service.js      (CRUD websites)
│   │   │       ├── page.service.js         (CRUD pages)
│   │   │       ├── chunk.service.js        (CRUD chunks)
│   │   │       ├── conversation.service.js (CRUD conversations)
│   │   │       ├── message.service.js      (CRUD messages)
│   │   │       └── scrapeJob.service.js    (Create & track jobs)
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.js                   (Logging utility)
│   │   │   ├── validators.js               (Input validation functions)
│   │   │   ├── errorHandler.js             (Centralized error handling)
│   │   │   ├── tokenCounter.js             (Estimate token counts)
│   │   │   ├── urlNormalizer.js            (Normalize URLs for dedup)
│   │   │   ├── duplicateDetector.js        (Check duplicates)
│   │   │   ├── rateLimiter.js              (Rate limiting logic)
│   │   │   └── sleep.js                    (Async delay utility)
│   │   │
│   │   ├── middleware/
│   │   │   ├── error.middleware.js         (Catch all errors)
│   │   │   ├── validation.middleware.js    (Request validation)
│   │   │   ├── logging.middleware.js       (Request/response logging)
│   │   │   └── cors.middleware.js          (CORS setup)
│   │   │
│   │   └── types/
│   │       ├── api.types.js                (Request/response schemas)
│   │       ├── scraper.types.js            (Scraper types)
│   │       ├── rag.types.js                (RAG types)
│   │       └── database.types.js           (DB model types)
│   │
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_init_schema.sql         (Create all tables)
│   │   │   └── 002_add_indexes.sql         (Add performance indexes)
│   │   │
│   │   └── seeds/
│   │       └── sample_data.js              (Test data for development)
│   │
│   ├── scripts/
│   │   ├── setup-db.js                     (Initialize database)
│   │   ├── test-rag.js                     (Test RAG end-to-end)
│   │   ├── test-ollama.js                  (Verify Ollama connection)
│   │   ├── test-chroma.js                  (Verify ChromaDB connection)
│   │   └── demo-scrape.js                  (Demo scraping workflow)
│   │
│   └── tests/
│       ├── scraper.test.js
│       ├── rag.test.js
│       ├── content.test.js
│       └── api.test.js
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx                        (Entry point)
│   │   ├── App.jsx
│   │   │
│   │   ├── components/
│   │   │   ├── ScrapeForm.jsx              (Input URL + submit)
│   │   │   ├── ScrapeProgress.jsx          (Show scraping progress)
│   │   │   ├── ChatInterface.jsx           (Chat UI)
│   │   │   ├── SourceAttribution.jsx       (Show sources)
│   │   │   ├── ConversationHistory.jsx     (Chat history)
│   │   │   ├── WebsiteList.jsx             (List scraped sites)
│   │   │   └── HealthStatus.jsx            (Service status)
│   │   │
│   │   ├── hooks/
│   │   │   ├── useScrape.js                (Scrape API calls)
│   │   │   ├── useChat.js                  (Chat API calls)
│   │   │   ├── usePolling.js               (Poll progress endpoint)
│   │   │   └── useLocalStorage.js          (Persist conversations)
│   │   │
│   │   ├── services/
│   │   │   ├── api.js                      (Axios instance + base URL)
│   │   │   ├── scrapeApi.js                (Scrape endpoints)
│   │   │   ├── chatApi.js                  (Chat endpoints)
│   │   │   └── websiteApi.js               (Website endpoints)
│   │   │
│   │   ├── utils/
│   │   │   ├── validators.js               (Client-side validation)
│   │   │   ├── formatters.js               (Format responses)
│   │   │   └── constants.js                (API URLs, timeouts)
│   │   │
│   │   └── styles/
│   │       ├── App.css
│   │       ├── components.css
│   │       └── variables.css
│   │
│   ├── vite.config.js
│   ├── package.json
│   └── index.html
│
├── docs/
│   ├── ARCHITECTURE.md                     (This file - updated version)
│   ├── API_REFERENCE.md                    (Detailed API docs)
│   ├── SETUP_GUIDE.md                      (Installation instructions)
│   ├── TROUBLESHOOTING.md                  (Common issues & fixes)
│   └── IMPLEMENTATION_CHECKLIST.md          (Step-by-step guide)
│
└── docker-compose.yml                      (Optional: containerize services)
```

---

## **4. ENVIRONMENT VARIABLES (.env.example)**

```bash
# Backend Configuration
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug

# Database
DATABASE_PATH=./data/rag.db
DATABASE_TIMEOUT_MS=5000

# Ollama Configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral
OLLAMA_TIMEOUT_MS=60000
OLLAMA_TEMPERATURE=0.3
OLLAMA_TOP_P=0.9
OLLAMA_MAX_TOKENS=512

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
CHROMADB_PERSIST_DIRECTORY=./data/chroma

# Scraper Configuration
SCRAPER_REQUEST_DELAY_MS=2000
SCRAPER_REQUEST_TIMEOUT_MS=30000
SCRAPER_MAX_CONCURRENT=2
SCRAPER_MAX_PAGES_PER_DOMAIN=50
SCRAPER_MAX_RETRIES=3
SCRAPER_RESPECT_ROBOTS_TXT=true

# RAG Configuration
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=100
RAG_SIMILARITY_THRESHOLD=0.6
RAG_N_RESULTS=5
RAG_MAX_HISTORY=10

# Frontend Configuration
VITE_API_BASE_URL=http://localhost:5000/api
VITE_SCRAPE_POLL_INTERVAL_MS=2000

# Logging
LOG_FORMAT=json
LOG_FILE=./logs/app.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5
```

---

## **5. API SPECIFICATIONS (EXACT PAYLOADS)**

### **POST /api/scrape**

```javascript
// REQUEST:
{
    "url": "https://example.com",
    "options": {
        "maxPages": 50,
        "followSubdomains": false,
        "includeJS": false  // true = use Puppeteer (slower, v2 feature)
    }
}

// RESPONSE (202 ACCEPTED - async job):
{
    "success": true,
    "data": {
        "jobId": "job_abc123",
        "websiteId": "website_xyz789",
        "status": "queued",
        "statusUrl": "/api/scrape/job_abc123/status"
    }
}

// ERROR RESPONSE:
{
    "success": false,
    "error": {
        "code": "E_INVALID_URL",
        "message": "Invalid URL format",
        "statusCode": 400
    }
}
```

### **GET /api/scrape/:jobId/status**

```javascript
// RESPONSE:
{
    "success": true,
    "data": {
        "jobId": "job_abc123",
        "websiteId": "website_xyz789",
        "status": "in_progress",
        "pages_found": 47,
        "pages_crawled": 12,
        "pages_processed": 10,
        "chunks_generated": 102,
        "embeddings_stored": 102,
        "current_page": "https://example.com/about",
        "current_page_status": "processing",
        "progress_percent": 25.5,
        "eta_seconds": 35,
        "error_count": 0
    }
}
```

### **POST /api/chat**

```javascript
// REQUEST:
{
    "websiteId": "website_xyz789",
    "message": "What is your company mission?",
    "conversationId": "conv_123" // optional, creates new if omitted
}

// RESPONSE:
{
    "success": true,
    "data": {
        "conversationId": "conv_123",
        "messageId": "msg_456",
        "role": "assistant",
        "content": "Based on the company website, the mission is...",
        "sources": [
            {
                "chunkId": "chunk_001",
                "pageUrl": "https://example.com/about",
                "pageTitle": "About Us",
                "snippet": "Our mission is to...",
                "similarity": 0.89
            }
        ],
        "confidence": "high",
        "timestamp": "2024-01-15T10:30:00Z"
    }
}
```

### **GET /api/conversations/:conversationId**

```javascript
// RESPONSE:
{
    "success": true,
    "data": {
        "conversationId": "conv_123",
        "websiteId": "website_xyz789",
        "created_at": "2024-01-15T09:00:00Z",
        "messages": [
            {
                "messageId": "msg_001",
                "role": "user",
                "content": "What is your company mission?",
                "created_at": "2024-01-15T10:00:00Z"
            },
            {
                "messageId": "msg_002",
                "role": "assistant",
                "content": "Based on the company website...",
                "sources": [...],
                "created_at": "2024-01-15T10:30:00Z"
            }
        ]
    }
}
```

### **GET /api/health**

```javascript
// RESPONSE:
{
    "success": true,
    "data": {
        "status": "healthy",
        "timestamp": "2024-01-15T10:30:00Z",
        "services": {
            "database": "connected",
            "ollama": "connected",
            "chromadb": "connected"
        },
        "version": "1.0.0"
    }
}

// OR if Ollama is down:
{
    "success": false,
    "data": {
        "status": "degraded",
        "services": {
            "database": "connected",
            "ollama": "disconnected",
            "chromadb": "connected"
        },
        "errors": [
            "Ollama service not responding"
        ]
    }
}
```

---

## **6. IMPLEMENTATION CHECKLIST**

### **Phase 1: Setup & Infrastructure (Day 1-2)**

```
☐ Create project structure (use directory structure above)
☐ Setup .env file (copy from .env.example)
☐ Install dependencies:
  ☐ npm init
  ☐ npm install express axios sqlite3 cheerio uuid dotenv
  ☐ npm install --save-dev nodemon jest
☐ Initialize SQLite database (run migrations)
☐ Setup Ollama locally:
  ☐ Download Ollama from ollama.ai
  ☐ ollama pull mistral
  ☐ ollama serve (keep running in terminal)
☐ Create Express app.js with basic routes
☐ Verify backend starts: npm run dev → http://localhost:5000
☐ Test GET /api/health → should return service status
```

### **Phase 2: Scraper & Content (Day 3-4)**

```
☐ Implement scraper/crawler.service.js:
  ☐ Find all pages on a domain (BFS/DFS)
  ☐ Add robots.txt checking
  ☐ Add rate limiting (2-second delays)
  ☐ Add duplicate detection (URL normalization)
  ☐ Return list of URLs found

☐ Implement content/cleaner.service.js:
  ☐ Parse HTML with Cheerio
  ☐ Remove script/style tags
  ☐ Extract text content
  ☐ Remove boilerplate (nav, footer)
  ☐ Validate content length

☐ Implement content/chunker.service.js:
  ☐ Split text into 512-token chunks
  ☐ Add 100-token overlap
  ☐ Handle code blocks specially
  ☐ Return array of chunks with metadata

☐ Test manually:
  ☐ node scripts/demo-scrape.js
  ☐ Verify database has pages & chunks
  ☐ Check content cleanliness
```

### **Phase 3: Embeddings & Vector Store (Day 5)**

```
☐ Implement embeddings/embedding.service.js:
  ☐ Call Ollama embedding endpoint
  ☐ Handle timeouts/errors
  ☐ Return embedding vectors

☐ Implement vector/chroma.service.js:
  ☐ Create ChromaDB collection
  ☐ Store chunk embeddings with metadata
  ☐ Implement query function
  ☐ Implement similarity filtering

☐ Implement vector/retrieval.service.js:
  ☐ Take user question
  ☐ Generate question embedding
  ☐ Retrieve top-5 similar chunks
  ☐ Filter by similarity threshold
  ☐ Return context with sources

☐ Test:
  ☐ Scrape a website
  ☐ Generate embeddings
  ☐ Ask a question
  ☐ Verify retrieval accuracy
```

### **Phase 4: RAG Pipeline (Day 6-7)**

```
☐ Implement rag/prompt.service.js:
  ☐ Build system prompt (see section 2.2)
  ☐ Format retrieved context
  ☐ Include chat history
  ☐ Return complete prompt string

☐ Implement llm/ollama.service.js:
  ☐ Wrap Ollama API calls
  ☐ Handle timeouts
  ☐ Stream responses
  ☐ Error handling

☐ Implement rag/rag.service.js (orchestrator):
  ☐ Load chat history
  ☐ Retrieve relevant context
  ☐ Build prompt
  ☐ Call Ollama
  ☐ Save conversation
  ☐ Return formatted response

☐ Implement controllers & routes:
  ☐ POST /api/chat endpoint
  ☐ Validate input
  ☐ Call RAG service
  ☐ Return response with sources

☐ Test end-to-end:
  ☐ Ask question about scraped website
  ☐ Verify answer is grounded in content
  ☐ Check source attribution
```

### **Phase 5: Frontend (Day 8-9)**

```
☐ Setup React + Vite
☐ Create ScrapeForm component
  ☐ URL input
  ☐ Submit button
  ☐ Show loading state

☐ Create ScrapeProgress component
  ☐ Poll /api/scrape/:jobId/status
  ☐ Display progress bar
  ☐ Show current page being scraped

☐ Create ChatInterface component
  ☐ Message input
  ☐ Display conversation
  ☐ Show sources on hover

☐ Create SourceAttribution component
  ☐ Show which chunks answered question
  ☐ Link to source pages
  ☐ Display similarity score

☐ Implement error handling
  ☐ Display error messages
  ☐ Retry logic
  ☐ Loading states

☐ Test UI:
  ☐ Scrape a website
  ☐ Ask questions
  ☐ Verify sources
```

### **Phase 6: Polish & Testing (Day 10)**

```
☐ Error handling & logging
☐ Health check endpoint
☐ Input validation (all endpoints)
☐ Rate limiting (if many users)
☐ Database cleanup (delete old conversations)
☐ Performance optimization (index queries)
☐ Documentation:
  ☐ README
  ☐ API documentation
  ☐ Setup guide
  ☐ Troubleshooting guide
☐ Demo video or screenshots
```

---

## **7. DEPLOYMENT CHECKLIST**

```
Before deploying, verify:

☐ .env configured correctly (no hardcoded secrets)
☐ Database migrations run
☐ Ollama service running (and accessible to backend)
☐ ChromaDB running (or embedded)
☐ All env vars set
☐ Logging working
☐ Health check endpoint working
☐ Error handling tested (what if Ollama goes down?)
☐ Rate limiting working
☐ Frontend built (npm run build)
☐ CORS configured correctly
☐ Database backups configured
```

---

## **SUMMARY: What's Different From Original**

| Aspect | Original | Now (Complete) |
|--------|----------|----------------|
| Chunking | "chunk text" | 512 tokens, 100-token overlap, specific algorithm |
| Similarity | "retrieve context" | 0.6 threshold, top-5 results, fallback logic |
| Ollama | "call LLM" | Mistral 7B, context window, memory management |
| Error Handling | None specified | Try-catch everywhere, retry logic, error codes |
| Rate Limiting | Not mentioned | 2-sec delays, max 2 concurrent, robots.txt check |
| Duplicates | Basic mention | URL normalization + content hash strategy |
| Progress Tracking | Not specified | Job tracking, ETA, live status endpoint |
| Database | Basic schema | Full schema with 6 tables + indexes |
| Directory | Partial | Complete structure (30+ files) with purpose of each |
| API Specs | High-level | Exact request/response payloads |

---

**This is now developer-ready. Every question "how do I implement X?" has an answer in sections 2.1-2.10.**

