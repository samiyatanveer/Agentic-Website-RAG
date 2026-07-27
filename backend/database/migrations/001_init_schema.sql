-- =============================================================================
-- Migration 001: Initial Schema
-- =============================================================================
-- This file is the canonical SQL reference for the database schema.
-- The Node.js equivalent lives in backend/src/config/database.js.
-- Run manually with: sqlite3 data/rag.db < database/migrations/001_init_schema.sql
-- =============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL;

-- ─── websites ─────────────────────────────────────────────────────────────────
-- Stores one record per scraped website.
-- url_hash enables fast duplicate detection without a full URL string scan.
CREATE TABLE IF NOT EXISTS websites (
  id            TEXT PRIMARY KEY,
  user_id       TEXT,                              -- Optional future multi-user support
  url           TEXT NOT NULL UNIQUE,              -- Normalized canonical URL
  url_hash      TEXT NOT NULL UNIQUE,              -- SHA-256(normalized url) for dedup
  title         TEXT,
  description   TEXT,
  status        TEXT DEFAULT 'active',             -- active | archived
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_pages   INTEGER DEFAULT 0,                 -- Denormalized counter (perf)
  total_chunks  INTEGER DEFAULT 0,                 -- Denormalized counter (perf)
  error_message TEXT                               -- Last error if scrape failed
);

-- ─── pages ────────────────────────────────────────────────────────────────────
-- One row per scraped page within a website.
-- content_hash enables change detection on re-scrape.
CREATE TABLE IF NOT EXISTS pages (
  id           TEXT PRIMARY KEY,
  website_id   TEXT NOT NULL,
  url          TEXT NOT NULL,
  title        TEXT,
  content      TEXT NOT NULL,                      -- Extracted plain text
  content_hash TEXT,                               -- SHA-256(content) for change detection
  is_crawlable BOOLEAN DEFAULT 1,                  -- 0 if blocked by robots.txt
  status       TEXT DEFAULT 'complete',            -- queued | crawling | processing | complete | failed
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
);

-- ─── chunks ───────────────────────────────────────────────────────────────────
-- Text chunks produced by splitting page content.
-- is_embedded tracks which chunks have been sent to ChromaDB.
CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL,
  website_id  TEXT NOT NULL,
  chunk_text  TEXT NOT NULL,
  chunk_index INTEGER,                             -- Position within the page
  token_count INTEGER,                             -- Estimated token length
  is_embedded BOOLEAN DEFAULT 0,                  -- 1 after stored in ChromaDB
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(page_id)    REFERENCES pages(id)    ON DELETE CASCADE,
  FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
);

-- ─── conversations ────────────────────────────────────────────────────────────
-- A chat session scoped to a website's knowledge base.
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  website_id TEXT,                                 -- NULL if website was deleted (SET NULL)
  title      TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE SET NULL
);

-- ─── messages ─────────────────────────────────────────────────────────────────
-- Individual chat turns (user and assistant).
-- sources is a JSON array of chunk references used to build the answer.
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL,                   -- 'user' | 'assistant' | 'system'
  content         TEXT NOT NULL,
  sources         TEXT,                            -- JSON: [{ chunkId, url, text }]
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- ─── scrape_jobs ──────────────────────────────────────────────────────────────
-- Tracks the full lifecycle and progress of each scrape operation.
CREATE TABLE IF NOT EXISTS scrape_jobs (
  id               TEXT PRIMARY KEY,
  website_id       TEXT NOT NULL,
  status           TEXT DEFAULT 'queued',          -- queued | in_progress | completed | failed
  started_at       TIMESTAMP,
  completed_at     TIMESTAMP,
  pages_found      INTEGER DEFAULT 0,              -- Total pages discovered
  pages_crawled    INTEGER DEFAULT 0,              -- Pages fetched (HTML downloaded)
  pages_processed  INTEGER DEFAULT 0,              -- Pages text-extracted
  chunks_generated INTEGER DEFAULT 0,              -- Chunks produced
  embeddings_stored INTEGER DEFAULT 0,             -- Chunks sent to ChromaDB
  current_page_url TEXT,                           -- Live progress: URL being processed
  error_message    TEXT,
  error_count      INTEGER DEFAULT 0,              -- Non-fatal errors encountered
  eta_seconds      INTEGER,                        -- Estimated seconds to completion
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
);
