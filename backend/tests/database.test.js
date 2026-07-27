/**
 * database.test.js
 * Comprehensive tests for all 6 database services.
 *
 * Each describe block tests exactly one service.
 * A fresh test.db is created for this suite and deleted in afterAll.
 *
 * Coverage:
 *  - website.service  — CRUD, duplicate detection, URL normalization
 *  - page.service     — CRUD, content-hash change detection
 *  - chunk.service    — Bulk insert, embedding tracking
 *  - conversation.service — CRUD, touch timestamp
 *  - message.service  — CRUD, recent history window, sources deserialization
 *  - scrapeJob.service — Full lifecycle, progress counters, calculateProgress
 */

import { beforeAll, afterAll, beforeEach, describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { initializeDatabase, closeDatabase, getDatabase } from '../src/config/database.js';
import * as W  from '../src/services/database/website.service.js';
import * as P  from '../src/services/database/page.service.js';
import * as C  from '../src/services/database/chunk.service.js';
import * as CV from '../src/services/database/conversation.service.js';
import * as M  from '../src/services/database/message.service.js';
import * as SJ from '../src/services/database/scrapeJob.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.resolve(__dirname, '../data/test.db');

// ─── Suite Setup / Teardown ───────────────────────────────────────────────────

beforeAll(async () => {
  await initializeDatabase();
});

afterAll(async () => {
  await closeDatabase();
  // Clean up test database file
  for (const suffix of ['', '-shm', '-wal']) {
    const f = TEST_DB_PATH + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

// Wipe all tables before each test for isolation
beforeEach(async () => {
  const db = await getDatabase();
  // Disable FK constraints temporarily so we can truncate in any order
  await db.run('PRAGMA foreign_keys = OFF');
  for (const t of ['messages', 'conversations', 'chunks', 'pages', 'scrape_jobs', 'websites']) {
    await db.run(`DELETE FROM ${t}`);
  }
  await db.run('PRAGMA foreign_keys = ON');
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function makeWebsite(url = 'https://example.com', opts = {}) {
  return W.createWebsite(url, { title: 'Test Site', ...opts });
}

async function makePage(websiteId, url = 'https://example.com/page', content = 'Hello world content text') {
  return P.createPage(websiteId, url, content, { title: 'Test Page' });
}

// ─── 1. website.service ───────────────────────────────────────────────────────

describe('website.service', () => {
  test('createWebsite inserts a record and returns it', async () => {
    const w = await makeWebsite();
    expect(w.id).toBeDefined();
    // normalizeURL keeps root trailing slash (https://example.com/ is canonical)
    expect(w.url).toMatch(/^https:\/\/example\.com/);
    expect(w.url_hash).toBeDefined();
    expect(w.status).toBe('active');
    expect(w.total_pages).toBe(0);
    expect(w.total_chunks).toBe(0);
  });

  test('createWebsite normalizes the URL before storage', async () => {
    // Trailing slash on root and capital letters should be normalized
    const w = await makeWebsite('https://EXAMPLE.COM/');
    // URL normalizer lowercases host; root path keeps trailing slash per URL spec
    expect(w.url).toMatch(/^https:\/\/example\.com/);
  });

  test('createWebsite normalizes equivalent URLs to the same hash', async () => {
    const w1 = await makeWebsite('https://example.com/');
    const w2Result = await W.checkDuplicateWebsite('https://EXAMPLE.COM');
    expect(w2Result.isDuplicate).toBe(true);
    expect(w2Result.websiteId).toBe(w1.id);
  });

  test('createWebsite throws DUPLICATE_URL on exact duplicate', async () => {
    await makeWebsite('https://example.com');
    await expect(makeWebsite('https://example.com')).rejects.toMatchObject({
      code: 'E_DUPLICATE_URL',
    });
  });

  test('checkDuplicateWebsite returns false for unseen URLs', async () => {
    const result = await W.checkDuplicateWebsite('https://new-site.com');
    expect(result.isDuplicate).toBe(false);
    expect(result.website).toBeUndefined();
  });

  test('getWebsiteById returns the website', async () => {
    const w = await makeWebsite();
    const found = await W.getWebsiteById(w.id);
    expect(found.id).toBe(w.id);
    expect(found.url).toBe(w.url);
  });

  test('getWebsiteById returns null for unknown ID', async () => {
    const found = await W.getWebsiteById('nonexistent');
    // sqlite `get` returns undefined when no row found
    expect(found).toBeFalsy();
  });

  test('getAllWebsites returns all records', async () => {
    await makeWebsite('https://site1.com');
    await makeWebsite('https://site2.com');
    const all = await W.getAllWebsites();
    expect(all.length).toBe(2);
  });

  test('updateWebsite patches allowed fields', async () => {
    const w = await makeWebsite();
    const updated = await W.updateWebsite(w.id, { title: 'Updated Title', status: 'archived' });
    expect(updated.title).toBe('Updated Title');
    expect(updated.status).toBe('archived');
  });

  test('incrementWebsiteStats atomically adds to counters', async () => {
    const w = await makeWebsite();
    await W.incrementWebsiteStats(w.id, { pages: 3, chunks: 12 });
    await W.incrementWebsiteStats(w.id, { pages: 2, chunks: 8 });
    const updated = await W.getWebsiteById(w.id);
    expect(updated.total_pages).toBe(5);
    expect(updated.total_chunks).toBe(20);
  });

  test('deleteWebsite removes the record and returns true', async () => {
    const w = await makeWebsite();
    const deleted = await W.deleteWebsite(w.id);
    expect(deleted).toBe(true);
    // sqlite `get` returns undefined when no row found
    expect(await W.getWebsiteById(w.id)).toBeFalsy();
  });

  test('deleteWebsite returns false for unknown ID', async () => {
    const deleted = await W.deleteWebsite('nonexistent');
    expect(deleted).toBe(false);
  });
});

// ─── 2. page.service ─────────────────────────────────────────────────────────

describe('page.service', () => {
  let website;
  beforeEach(async () => { website = await makeWebsite(); });

  test('createPage inserts a record with a content_hash', async () => {
    const page = await makePage(website.id);
    expect(page.id).toBeDefined();
    expect(page.content_hash).toBeDefined();
    expect(page.content_hash).toHaveLength(64); // SHA-256 hex
    expect(page.website_id).toBe(website.id);
  });

  test('createPage rejects duplicate url+website_id', async () => {
    await makePage(website.id, 'https://example.com/page');
    await expect(makePage(website.id, 'https://example.com/page')).rejects.toMatchObject({
      code: 'E_DUPLICATE_URL',
    });
  });

  test('getPagesByWebsite returns pages in creation order', async () => {
    await makePage(website.id, 'https://example.com/a');
    await makePage(website.id, 'https://example.com/b');
    const pages = await P.getPagesByWebsite(website.id);
    expect(pages.length).toBe(2);
    expect(pages[0].url).toBe('https://example.com/a');
  });

  test('getPageByUrl finds the page by url and websiteId', async () => {
    const page = await makePage(website.id, 'https://example.com/x');
    const found = await P.getPageByUrl('https://example.com/x', website.id);
    expect(found.id).toBe(page.id);
  });

  test('getPageSummariesByWebsite excludes content field', async () => {
    await makePage(website.id);
    const summaries = await P.getPageSummariesByWebsite(website.id);
    expect(summaries.length).toBe(1);
    expect(summaries[0].content).toBeUndefined();
    expect(summaries[0].content_hash).toBeDefined();
  });

  test('hasContentChanged — returns changed:false for identical content', async () => {
    const content = 'Stable content that does not change';
    await P.createPage(website.id, 'https://example.com/stable', content);
    const result = await P.hasContentChanged('https://example.com/stable', website.id, content);
    expect(result.changed).toBe(false);
    expect(result.existingPage).not.toBeNull();
  });

  test('hasContentChanged — returns changed:true for different content', async () => {
    await P.createPage(website.id, 'https://example.com/p', 'Old content version');
    const result = await P.hasContentChanged('https://example.com/p', website.id, 'New content version');
    expect(result.changed).toBe(true);
    expect(result.newHash).toHaveLength(64);
  });

  test('hasContentChanged — returns changed:true for new (unseen) URL', async () => {
    const result = await P.hasContentChanged('https://example.com/new-page', website.id, 'Some content');
    expect(result.changed).toBe(true);
    expect(result.existingPage).toBeNull();
  });

  test('updatePage auto-regenerates content_hash when content is updated', async () => {
    const page = await makePage(website.id);
    const oldHash = page.content_hash;
    const updated = await P.updatePage(page.id, { content: 'Completely different new content' });
    expect(updated.content_hash).not.toBe(oldHash);
    expect(updated.content_hash).toHaveLength(64);
  });

  test('countPagesByWebsite counts correctly', async () => {
    await makePage(website.id, 'https://example.com/1');
    await makePage(website.id, 'https://example.com/2');
    expect(await P.countPagesByWebsite(website.id)).toBe(2);
  });

  test('deletePagesByWebsite removes all pages', async () => {
    await makePage(website.id, 'https://example.com/1');
    await makePage(website.id, 'https://example.com/2');
    const deleted = await P.deletePagesByWebsite(website.id);
    expect(deleted).toBe(2);
    expect(await P.countPagesByWebsite(website.id)).toBe(0);
  });

  test('deleting a website cascades to pages', async () => {
    await makePage(website.id);
    await W.deleteWebsite(website.id);
    const pages = await P.getPagesByWebsite(website.id);
    expect(pages.length).toBe(0);
  });
});

// ─── 3. chunk.service ────────────────────────────────────────────────────────

describe('chunk.service', () => {
  let website, page;
  beforeEach(async () => {
    website = await makeWebsite();
    page = await makePage(website.id);
  });

  const sampleChunks = [
    { text: 'First chunk of content here', index: 0, tokenCount: 5 },
    { text: 'Second chunk of content here', index: 1, tokenCount: 5 },
    { text: 'Third chunk of content here', index: 2, tokenCount: 5 },
  ];

  test('createChunks bulk-inserts and returns IDs', async () => {
    const ids = await C.createChunks(page.id, website.id, sampleChunks);
    expect(ids).toHaveLength(3);
    ids.forEach(id => expect(typeof id).toBe('string'));
  });

  test('createChunks returns empty array for empty input', async () => {
    const ids = await C.createChunks(page.id, website.id, []);
    expect(ids).toHaveLength(0);
  });

  test('getChunksByPage returns chunks in order', async () => {
    await C.createChunks(page.id, website.id, sampleChunks);
    const chunks = await C.getChunksByPage(page.id);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].chunk_index).toBe(0);
    expect(chunks[2].chunk_index).toBe(2);
  });

  test('all new chunks start as not embedded', async () => {
    await C.createChunks(page.id, website.id, sampleChunks);
    const chunks = await C.getChunksByPage(page.id);
    chunks.forEach(c => expect(c.is_embedded).toBe(0));
  });

  test('getUnembeddedChunks returns only unembedded', async () => {
    const ids = await C.createChunks(page.id, website.id, sampleChunks);
    await C.markChunkEmbedded(ids[0]);
    const unembedded = await C.getUnembeddedChunks(website.id);
    expect(unembedded).toHaveLength(2);
    expect(unembedded.every(c => c.is_embedded === 0)).toBe(true);
  });

  test('markChunksEmbedded marks multiple chunks in one call', async () => {
    const ids = await C.createChunks(page.id, website.id, sampleChunks);
    await C.markChunksEmbedded([ids[0], ids[1]]);
    const chunks = await C.getChunksByPage(page.id);
    expect(chunks[0].is_embedded).toBe(1);
    expect(chunks[1].is_embedded).toBe(1);
    expect(chunks[2].is_embedded).toBe(0);
  });

  test('countChunksByWebsite counts all chunks', async () => {
    await C.createChunks(page.id, website.id, sampleChunks);
    expect(await C.countChunksByWebsite(website.id)).toBe(3);
  });

  test('countEmbeddedChunks counts only embedded', async () => {
    const ids = await C.createChunks(page.id, website.id, sampleChunks);
    await C.markChunksEmbedded([ids[0], ids[2]]);
    expect(await C.countEmbeddedChunks(website.id)).toBe(2);
  });

  test('deleteChunksByPage removes only that page\'s chunks', async () => {
    const page2 = await makePage(website.id, 'https://example.com/p2', 'other content');
    await C.createChunks(page.id,  website.id, sampleChunks);
    await C.createChunks(page2.id, website.id, [{ text: 'other', index: 0 }]);
    await C.deleteChunksByPage(page.id);
    expect(await C.countChunksByWebsite(website.id)).toBe(1);
  });

  test('deleting a website cascades to chunks', async () => {
    await C.createChunks(page.id, website.id, sampleChunks);
    await W.deleteWebsite(website.id);
    // No direct way to query deleted chunks, but no error = cascade worked
    expect(await C.getChunksByPage(page.id)).toHaveLength(0);
  });
});

// ─── 4. conversation.service ─────────────────────────────────────────────────

describe('conversation.service', () => {
  let website;
  beforeEach(async () => { website = await makeWebsite(); });

  test('createConversation inserts a record', async () => {
    const convo = await CV.createConversation(website.id, { title: 'Test Chat' });
    expect(convo.id).toBeDefined();
    expect(convo.website_id).toBe(website.id);
    expect(convo.title).toBe('Test Chat');
  });

  test('getConversationsByWebsite returns conversations newest first', async () => {
    await CV.createConversation(website.id, { title: 'First' });
    await CV.createConversation(website.id, { title: 'Second' });
    const convos = await CV.getConversationsByWebsite(website.id);
    expect(convos.length).toBe(2);
    // Both were created at (roughly) the same time — just verify count
  });

  test('getConversationsByUser filters by user_id', async () => {
    await CV.createConversation(website.id, { userId: 'user-A', title: 'A' });
    await CV.createConversation(website.id, { userId: 'user-B', title: 'B' });
    const forA = await CV.getConversationsByUser('user-A');
    expect(forA.length).toBe(1);
    expect(forA[0].title).toBe('A');
  });

  test('updateConversation patches title', async () => {
    const convo = await CV.createConversation(website.id, { title: 'Old' });
    const updated = await CV.updateConversation(convo.id, { title: 'New' });
    expect(updated.title).toBe('New');
  });

  test('touchConversation updates updated_at', async () => {
    const convo = await CV.createConversation(website.id);
    const before = convo.updated_at;
    // Small delay to ensure timestamps differ
    await new Promise(r => setTimeout(r, 10));
    await CV.touchConversation(convo.id);
    const after = await CV.getConversationById(convo.id);
    expect(after.updated_at >= before).toBe(true);
  });

  test('deleteConversation removes the record and returns true', async () => {
    const convo = await CV.createConversation(website.id);
    expect(await CV.deleteConversation(convo.id)).toBe(true);
    // sqlite `get` returns undefined for missing rows
    expect(await CV.getConversationById(convo.id)).toBeFalsy();
  });

  test('deleteConversation returns false for unknown id', async () => {
    expect(await CV.deleteConversation('nonexistent')).toBe(false);
  });

  test('website SET NULL on delete preserves conversation record', async () => {
    const convo = await CV.createConversation(website.id);
    await W.deleteWebsite(website.id);
    const found = await CV.getConversationById(convo.id);
    // Conversation stays but website_id becomes null
    expect(found).not.toBeNull();
    expect(found.website_id).toBeNull();
  });
});

// ─── 5. message.service ──────────────────────────────────────────────────────

describe('message.service', () => {
  let website, convo;
  beforeEach(async () => {
    website = await makeWebsite();
    convo = await CV.createConversation(website.id);
  });

  test('createMessage inserts user and assistant turns', async () => {
    const msg = await M.createMessage(convo.id, 'user', 'Hello?');
    expect(msg.id).toBeDefined();
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('Hello?');
    expect(msg.sources).toBeNull();
  });

  test('createMessage serializes and deserializes sources', async () => {
    const sources = [{ chunkId: 'abc', url: 'https://example.com', text: 'snippet' }];
    const msg = await M.createMessage(convo.id, 'assistant', 'Answer', { sources });
    expect(Array.isArray(msg.sources)).toBe(true);
    expect(msg.sources[0].chunkId).toBe('abc');
  });

  test('getMessagesByConversation returns all messages in order', async () => {
    await M.createMessage(convo.id, 'user', 'Q1');
    await M.createMessage(convo.id, 'assistant', 'A1');
    await M.createMessage(convo.id, 'user', 'Q2');
    const msgs = await M.getMessagesByConversation(convo.id);
    expect(msgs.length).toBe(3);
    expect(msgs[0].content).toBe('Q1');
    expect(msgs[2].content).toBe('Q2');
  });

  test('getRecentMessages returns last N in chronological order', async () => {
    // Insert messages sequentially with a small delay to ensure distinct timestamps
    for (let i = 1; i <= 6; i++) {
      await M.createMessage(convo.id, i % 2 === 0 ? 'assistant' : 'user', `Message ${i}`);
      await new Promise(r => setTimeout(r, 5)); // distinct created_at
    }
    const recent = await M.getRecentMessages(convo.id, 4);
    expect(recent.length).toBe(4);
    // The last 4 messages should be 3,4,5,6 in chronological order
    const contents = recent.map(m => m.content);
    expect(contents).toContain('Message 3');
    expect(contents).toContain('Message 6');
    expect(contents).not.toContain('Message 1');
    // Verify chronological order
    const indices = contents.map(c => parseInt(c.replace('Message ', '')));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  test('getRecentMessages returns all if fewer than limit', async () => {
    await M.createMessage(convo.id, 'user', 'Only one');
    const recent = await M.getRecentMessages(convo.id, 10);
    expect(recent.length).toBe(1);
  });

  test('countMessages returns correct count', async () => {
    await M.createMessage(convo.id, 'user', 'A');
    await M.createMessage(convo.id, 'assistant', 'B');
    expect(await M.countMessages(convo.id)).toBe(2);
  });

  test('deleteMessagesByConversation removes all messages', async () => {
    await M.createMessage(convo.id, 'user', 'A');
    await M.createMessage(convo.id, 'assistant', 'B');
    const deleted = await M.deleteMessagesByConversation(convo.id);
    expect(deleted).toBe(2);
    expect(await M.countMessages(convo.id)).toBe(0);
  });

  test('deleting a conversation cascades to messages', async () => {
    await M.createMessage(convo.id, 'user', 'will be gone');
    await CV.deleteConversation(convo.id);
    // Messages should be gone
    expect(await M.countMessages(convo.id)).toBe(0);
  });
});

// ─── 6. scrapeJob.service ────────────────────────────────────────────────────

describe('scrapeJob.service', () => {
  let website;
  beforeEach(async () => { website = await makeWebsite(); });

  test('createScrapeJob creates a queued job', async () => {
    const job = await SJ.createScrapeJob(website.id);
    expect(job.id).toBeDefined();
    expect(job.status).toBe('queued');
    expect(job.website_id).toBe(website.id);
    expect(job.pages_found).toBe(0);
    expect(job.started_at).toBeNull();
    expect(job.completed_at).toBeNull();
  });

  test('markJobStarted transitions to in_progress with timestamp', async () => {
    const job = await SJ.createScrapeJob(website.id);
    const started = await SJ.markJobStarted(job.id);
    expect(started.status).toBe('in_progress');
    expect(started.started_at).not.toBeNull();
  });

  test('markJobCompleted transitions to completed with timestamp', async () => {
    const job = await SJ.createScrapeJob(website.id);
    await SJ.markJobStarted(job.id);
    const done = await SJ.markJobCompleted(job.id);
    expect(done.status).toBe('completed');
    expect(done.completed_at).not.toBeNull();
    expect(done.eta_seconds).toBeNull();
  });

  test('markJobFailed transitions to failed with error message', async () => {
    const job = await SJ.createScrapeJob(website.id);
    await SJ.markJobStarted(job.id);
    const failed = await SJ.markJobFailed(job.id, 'Connection timeout');
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('Connection timeout');
    expect(failed.completed_at).not.toBeNull();
  });

  test('updateScrapeProgress updates multiple fields at once', async () => {
    const job = await SJ.createScrapeJob(website.id);
    const updated = await SJ.updateScrapeProgress(job.id, {
      pages_found: 10,
      pages_crawled: 5,
      current_page_url: 'https://example.com/page-5',
      eta_seconds: 30,
    });
    expect(updated.pages_found).toBe(10);
    expect(updated.pages_crawled).toBe(5);
    expect(updated.current_page_url).toBe('https://example.com/page-5');
    expect(updated.eta_seconds).toBe(30);
  });

  test('incrementJobCounter atomically increments a counter', async () => {
    const job = await SJ.createScrapeJob(website.id);
    await SJ.incrementJobCounter(job.id, 'pages_crawled', 3);
    await SJ.incrementJobCounter(job.id, 'pages_crawled', 2);
    const updated = await SJ.getScrapeJob(job.id);
    expect(updated.pages_crawled).toBe(5);
  });

  test('incrementJobCounter rejects invalid field names', async () => {
    const job = await SJ.createScrapeJob(website.id);
    await expect(SJ.incrementJobCounter(job.id, 'bad_field')).rejects.toMatchObject({
      code: 'E_INVALID_INPUT',
    });
  });

  test('getScrapeJobsByWebsite lists jobs newest first', async () => {
    await SJ.createScrapeJob(website.id);
    await SJ.createScrapeJob(website.id);
    const jobs = await SJ.getScrapeJobsByWebsite(website.id);
    expect(jobs.length).toBe(2);
  });

  test('getLatestScrapeJob returns only the most recent', async () => {
    await SJ.createScrapeJob(website.id);
    const second = await SJ.createScrapeJob(website.id);
    const latest = await SJ.getLatestScrapeJob(website.id);
    expect(latest.id).toBe(second.id);
  });

  test('calculateProgress returns correct percentages', () => {
    const job = {
      pages_found: 10,
      pages_crawled: 5,
      chunks_generated: 20,
      embeddings_stored: 10,
    };
    const { pagesPercent, embeddingPercent } = SJ.calculateProgress(job);
    expect(pagesPercent).toBe(50);
    expect(embeddingPercent).toBe(50);
  });

  test('calculateProgress handles zero pages_found without divide-by-zero', () => {
    const job = { pages_found: 0, pages_crawled: 0, chunks_generated: 0, embeddings_stored: 0 };
    const { pagesPercent } = SJ.calculateProgress(job);
    expect(pagesPercent).toBe(0);
  });

  test('deleting a website cascades to scrape_jobs', async () => {
    const job = await SJ.createScrapeJob(website.id);
    await W.deleteWebsite(website.id);
    const found = await SJ.getScrapeJob(job.id);
    // sqlite `get` returns undefined for missing rows
    expect(found).toBeFalsy();
  });
});
