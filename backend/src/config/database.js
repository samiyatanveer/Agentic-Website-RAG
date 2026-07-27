/**
 * database.js
 * SQLite connection singleton + full schema initialization.
 * Uses the 'sqlite' wrapper for promise-based access over sqlite3.
 *
 * Phase 2 will move the schema SQL into separate migration files.
 * For now the full schema lives here so the server is self-contained.
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import env from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let dbInstance = null;

/**
 * Returns the singleton database connection.
 * Opens and caches it on the first call.
 */
export async function getDatabase() {
  if (dbInstance) return dbInstance;

  // Ensure the data directory exists
  const dbDir = path.dirname(path.resolve(path.join(__dirname, '../../..'), env.DATABASE_PATH));
  fs.mkdirSync(dbDir, { recursive: true });

  dbInstance = await open({
    filename: path.resolve(path.join(__dirname, '../../..'), env.DATABASE_PATH),
    driver: sqlite3.Database,
    timeout: env.DATABASE_TIMEOUT_MS,
  });

  // Performance and safety pragmas
  await dbInstance.exec('PRAGMA journal_mode = WAL');
  await dbInstance.exec('PRAGMA foreign_keys = ON');
  await dbInstance.exec('PRAGMA synchronous = NORMAL');

  return dbInstance;
}

/**
 * Initializes the database by running all schema migrations inline.
 * Safe to call multiple times — uses IF NOT EXISTS throughout.
 */
export async function initializeDatabase() {
  const db = await getDatabase();

  // ─── websites ───────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS websites (
      id          TEXT PRIMARY KEY,
      user_id     TEXT,
      url         TEXT NOT NULL UNIQUE,
      url_hash    TEXT NOT NULL UNIQUE,
      title       TEXT,
      description TEXT,
      status      TEXT DEFAULT 'active',
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      total_pages   INTEGER DEFAULT 0,
      total_chunks  INTEGER DEFAULT 0,
      error_message TEXT
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_websites_url_hash ON websites(url_hash)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_websites_status    ON websites(status)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_websites_user      ON websites(user_id)`);

  // ─── pages ──────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS pages (
      id           TEXT PRIMARY KEY,
      website_id   TEXT NOT NULL,
      url          TEXT NOT NULL,
      title        TEXT,
      content      TEXT NOT NULL,
      content_hash TEXT,
      is_crawlable BOOLEAN DEFAULT 1,
      status       TEXT DEFAULT 'complete',
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_pages_website      ON pages(website_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_pages_content_hash ON pages(content_hash)`);
  await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_url_website ON pages(url, website_id)`);

  // ─── chunks ─────────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id          TEXT PRIMARY KEY,
      page_id     TEXT NOT NULL,
      website_id  TEXT NOT NULL,
      chunk_text  TEXT NOT NULL,
      chunk_index INTEGER,
      token_count INTEGER,
      is_embedded BOOLEAN DEFAULT 0,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(page_id)    REFERENCES pages(id)    ON DELETE CASCADE,
      FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_page        ON chunks(page_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_website     ON chunks(website_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_is_embedded ON chunks(is_embedded)`);

  // ─── conversations ──────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      website_id TEXT,
      title      TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE SET NULL
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_user    ON conversations(user_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_conversations_website ON conversations(website_id)`);

  // ─── messages ───────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      sources         TEXT,
      created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_created      ON messages(created_at)`);

  // ─── scrape_jobs ─────────────────────────────────────────────────────────────
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_jobs (
      id               TEXT PRIMARY KEY,
      website_id       TEXT NOT NULL,
      status           TEXT DEFAULT 'queued',
      started_at       TIMESTAMP,
      completed_at     TIMESTAMP,
      pages_found      INTEGER DEFAULT 0,
      pages_crawled    INTEGER DEFAULT 0,
      pages_processed  INTEGER DEFAULT 0,
      chunks_generated INTEGER DEFAULT 0,
      embeddings_stored INTEGER DEFAULT 0,
      current_page_url TEXT,
      error_message    TEXT,
      error_count      INTEGER DEFAULT 0,
      eta_seconds      INTEGER,
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(website_id) REFERENCES websites(id) ON DELETE CASCADE
    )
  `);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scrape_jobs_website ON scrape_jobs(website_id)`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status  ON scrape_jobs(status)`);

  console.log('✅ Database initialized — all tables and indexes ready');
}

/**
 * Closes the database connection.
 * Call during graceful shutdown.
 */
export async function closeDatabase() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('🔒 Database connection closed');
  }
}
