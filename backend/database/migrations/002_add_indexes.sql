-- =============================================================================
-- Migration 002: Performance Indexes
-- =============================================================================
-- All indexes for the schema defined in 001_init_schema.sql.
-- Run after 001_init_schema.sql.
-- =============================================================================

-- ─── websites ─────────────────────────────────────────────────────────────────
-- Primary duplicate-detection lookup (hash is faster than full URL compare)
CREATE INDEX IF NOT EXISTS idx_websites_url_hash ON websites(url_hash);
-- Filter by status (list active websites)
CREATE INDEX IF NOT EXISTS idx_websites_status ON websites(status);
-- Future multi-user: filter by user_id
CREATE INDEX IF NOT EXISTS idx_websites_user ON websites(user_id);

-- ─── pages ────────────────────────────────────────────────────────────────────
-- Most common query: all pages for a given website
CREATE INDEX IF NOT EXISTS idx_pages_website ON pages(website_id);
-- Change detection: lookup by content_hash
CREATE INDEX IF NOT EXISTS idx_pages_content_hash ON pages(content_hash);
-- Deduplication: a URL can only exist once per website
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_url_website ON pages(url, website_id);

-- ─── chunks ───────────────────────────────────────────────────────────────────
-- Fetch all chunks for a page (for re-chunking)
CREATE INDEX IF NOT EXISTS idx_chunks_page ON chunks(page_id);
-- Fetch all chunks for a website (for embedding pipeline)
CREATE INDEX IF NOT EXISTS idx_chunks_website ON chunks(website_id);
-- Embedding pipeline: find all un-embedded chunks
CREATE INDEX IF NOT EXISTS idx_chunks_is_embedded ON chunks(is_embedded);

-- ─── conversations ─────────────────────────────────────────────────────────────
-- List conversations for a user
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
-- List conversations by website knowledge base
CREATE INDEX IF NOT EXISTS idx_conversations_website ON conversations(website_id);

-- ─── messages ─────────────────────────────────────────────────────────────────
-- Fetch all messages for a conversation (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
-- Sort and filter by creation time (recent history window)
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

-- ─── scrape_jobs ──────────────────────────────────────────────────────────────
-- History lookup: all jobs for a website
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_website ON scrape_jobs(website_id);
-- Operations dashboard: filter by status (queued / in_progress)
CREATE INDEX IF NOT EXISTS idx_scrape_jobs_status ON scrape_jobs(status);
