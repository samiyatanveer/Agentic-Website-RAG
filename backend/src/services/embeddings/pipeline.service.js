/**
 * pipeline.service.js
 * End-to-end embedding pipeline orchestrator.
 *
 * SRP: Coordinates the full flow for a website's pages:
 *   1. Fetch all unembedded pages from SQLite
 *   2. Chunk each page's content
 *   3. Persist chunks to SQLite (chunk.service)
 *   4. Embed chunks via Ollama (embedding.service)
 *   5. Upsert vectors into ChromaDB (chroma.service)
 *   6. Mark chunks as embedded in SQLite
 *   7. Update scrape_jobs counters
 *
 * Does NOT fetch HTML, scrape pages, or manage conversations.
 */

import { chunkPage }               from './chunker.service.js';
import { embedChunks, embedQuery, isEmbedModelAvailable } from './embedding.service.js';
import { upsertEmbeddings, querySimilar, deleteWebsiteEmbeddings } from './chroma.service.js';
import * as chunkDbService          from '../database/chunk.service.js';
import * as pageService             from '../database/page.service.js';
import * as scrapeJobService        from '../database/scrapeJob.service.js';
import * as websiteService          from '../database/website.service.js';
import { createError }              from '../../utils/errorHandler.js';
import { ERROR_CODES }              from '../../config/constants.js';
import logger                       from '../../utils/logger.js';
import env                          from '../../config/env.js';

// ─── Main pipeline ────────────────────────────────────────────────────────────

/**
 * Run the embedding pipeline for all unembedded pages of a website.
 *
 * @param {string} websiteId
 * @param {{ jobId?: string, chunkSize?: number, overlap?: number }} opts
 * @returns {Promise<PipelineResult>}
 */
export async function embedWebsite(websiteId, opts = {}) {
  logger.info(`[Pipeline] Starting embedding for websiteId=${websiteId}`);

  // Guard: Ollama must be available
  const modelReady = await isEmbedModelAvailable();
  if (!modelReady) {
    throw createError(
      ERROR_CODES.OLLAMA_OFFLINE,
      `Embedding model '${env.OLLAMA_EMBED_MODEL}' not available. Run: ollama pull ${env.OLLAMA_EMBED_MODEL}`,
      503
    );
  }

  const pages = await pageService.getPagesByWebsite(websiteId);
  if (pages.length === 0) {
    logger.info(`[Pipeline] No pages found for websiteId=${websiteId}`);
    return { websiteId, pagesProcessed: 0, chunksCreated: 0, chunksEmbedded: 0 };
  }

  let totalChunksCreated  = 0;
  let totalChunksEmbedded = 0;
  let errorCount = 0;

  for (const page of pages) {
    try {
      const pageResult = await embedPage(page, opts);
      totalChunksCreated  += pageResult.chunksCreated;
      totalChunksEmbedded += pageResult.chunksEmbedded;
    } catch (err) {
      logger.warn(`[Pipeline] Failed to embed page ${page.url}: ${err.message}`);
      errorCount++;
    }
  }

  // Update scrape_jobs counters if a jobId was provided
  if (opts.jobId) {
    try {
      const job = await scrapeJobService.getScrapeJob(opts.jobId);
      if (job) {
        await scrapeJobService.updateScrapeProgress(opts.jobId, {
          chunks_generated:  (job.chunks_generated  ?? 0) + totalChunksCreated,
          embeddings_stored: (job.embeddings_stored ?? 0) + totalChunksEmbedded,
        });
      }
    } catch (err) {
      logger.warn(`[Pipeline] Failed to update job counters: ${err.message}`);
    }
  }

  // Update website total_chunks counter
  try {
    const totalNow = await chunkDbService.countChunksByWebsite(websiteId);
    await websiteService.incrementWebsiteStats(websiteId, { chunks: 0 }); // touches updated_at
    logger.info(`[Pipeline] websiteId=${websiteId} — total chunks in DB: ${totalNow}`);
  } catch { /* non-fatal */ }


  logger.info(
    `[Pipeline] Complete — ${pages.length} pages, ` +
    `${totalChunksCreated} chunks created, ${totalChunksEmbedded} embedded, ${errorCount} errors`
  );

  return {
    websiteId,
    pagesProcessed:  pages.length,
    chunksCreated:   totalChunksCreated,
    chunksEmbedded:  totalChunksEmbedded,
    errorCount,
  };
}

/**
 * Embed a single page: chunk → store → embed → upsert → mark.
 *
 * @param {object} page - Page DB record (must include content)
 * @param {{ chunkSize?, overlap? }} opts
 * @returns {Promise<{ chunksCreated: number, chunksEmbedded: number }>}
 */
export async function embedPage(page, opts = {}) {
  if (!page.content || page.content.trim().length === 0) {
    logger.debug(`[Pipeline] Page has no content, skipping: ${page.url}`);
    return { chunksCreated: 0, chunksEmbedded: 0 };
  }

  logger.debug(`[Pipeline] Embedding page: ${page.url}`);

  // 1. Delete any existing chunks for this page (re-embed on update)
  await chunkDbService.deleteChunksByPage(page.id);

  // 2. Chunk the page content
  const chunks = chunkPage(page, {
    chunkSize: opts.chunkSize ?? env.RAG_CHUNK_SIZE,
    overlap:   opts.overlap   ?? env.RAG_CHUNK_OVERLAP,
  });

  if (chunks.length === 0) {
    logger.debug(`[Pipeline] No chunks produced for page: ${page.url}`);
    return { chunksCreated: 0, chunksEmbedded: 0 };
  }

  // 3. Persist chunks to SQLite to get stable IDs
  const chunkIds = await chunkDbService.createChunks(
    page.id,
    page.website_id,
    chunks.map((c) => ({ text: c.text, index: c.index, tokenCount: c.tokenCount }))
  );

  // 4. Embed each chunk via Ollama
  const embeddings = await embedChunks(chunks, {
    onProgress: (done, total) =>
      logger.debug(`[Pipeline] Embedded ${done}/${total} chunks for ${page.url}`),
  });

  // 5. Upsert into ChromaDB with rich metadata
  const chromaItems = embeddings.map((emb, i) => ({
    id:       chunkIds[i],
    vector:   emb.vector,
    text:     emb.text,
    metadata: {
      websiteId:   page.website_id,
      pageId:      page.id,
      pageUrl:     page.url,
      pageTitle:   page.title ?? '',
      chunkIndex:  emb.chunkIndex,
    },
  }));

  await upsertEmbeddings(chromaItems);

  // 6. Mark all chunks as embedded in SQLite
  await chunkDbService.markChunksEmbedded(chunkIds);

  logger.debug(`[Pipeline] Page embedded: ${chunks.length} chunks — ${page.url}`);
  return { chunksCreated: chunks.length, chunksEmbedded: chunks.length };
}

// ─── Similarity search ────────────────────────────────────────────────────────

/**
 * Search for the most relevant chunks for a query string.
 * Embeds the query then queries ChromaDB.
 *
 * @param {string} query
 * @param {{
 *   nResults?: number,
 *   websiteId?: string,
 *   threshold?: number,
 * }} opts
 * @returns {Promise<import('./chroma.service.js').SimilarityResult[]>}
 */
export async function searchSimilar(query, opts = {}) {
  if (!query || !query.trim()) {
    throw createError(ERROR_CODES.INVALID_INPUT, 'Query must be a non-empty string', 400);
  }

  const queryVector = await embedQuery(query.trim());

  return querySimilar(queryVector, {
    nResults:  opts.nResults  ?? env.RAG_N_RESULTS,
    websiteId: opts.websiteId ?? null,
    threshold: opts.threshold ?? env.RAG_SIMILARITY_THRESHOLD,
  });
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Remove all embeddings for a website from ChromaDB and SQLite.
 * Called when a website is deleted.
 *
 * @param {string} websiteId
 */
export async function removeWebsiteEmbeddings(websiteId) {
  await deleteWebsiteEmbeddings(websiteId);
  await chunkDbService.deleteChunksByWebsite(websiteId);
  logger.info(`[Pipeline] Removed all embeddings for websiteId=${websiteId}`);
}
/**
 * Force re-index all existing pages of a website.
 *
 * This is useful when:
 * - the website is already scraped
 * - SQLite pages already exist
 * - ChromaDB was reset or a new collection was created
 */
export async function forceReindexWebsite(websiteId) {
  logger.info(
    `[Pipeline] Force re-index started for websiteId=${websiteId}`
  );

  // Check that the embedding model is available
  const modelReady = await isEmbedModelAvailable();

  if (!modelReady) {
    throw createError(
      ERROR_CODES.OLLAMA_OFFLINE,
      `Embedding model '${env.OLLAMA_EMBED_MODEL}' is not available. ` +
      `Run: ollama pull ${env.OLLAMA_EMBED_MODEL}`,
      503
    );
  }

  // Get all already-scraped pages from SQLite
  const pages = await pageService.getPagesByWebsite(websiteId);

  if (pages.length === 0) {
    throw createError(
      ERROR_CODES.NOT_FOUND,
      `No scraped pages found for websiteId=${websiteId}`,
      404
    );
  }

  logger.info(
    `[Pipeline] Found ${pages.length} existing pages. Re-indexing...`
  );

  let totalChunksCreated = 0;
  let totalChunksEmbedded = 0;
  let errorCount = 0;

  for (const page of pages) {
    try {
      const result = await embedPage(page);

      totalChunksCreated += result.chunksCreated;
      totalChunksEmbedded += result.chunksEmbedded;

      logger.info(
        `[Pipeline] Re-indexed page: ${page.url} ` +
        `(${result.chunksEmbedded} chunks)`
      );
    } catch (err) {
      errorCount++;

      logger.error(
        `[Pipeline] Failed to re-index ${page.url}: ${err.message}`
      );
    }
  }

  logger.info(
    `[Pipeline] Force re-index complete — ` +
    `${pages.length} pages, ` +
    `${totalChunksCreated} chunks created, ` +
    `${totalChunksEmbedded} vectors stored, ` +
    `${errorCount} errors`
  );

  return {
    websiteId,
    pagesProcessed: pages.length,
    chunksCreated: totalChunksCreated,
    chunksEmbedded: totalChunksEmbedded,
    errorCount,
  };
}
/**
 * @typedef {Object} PipelineResult
 * @property {string} websiteId
 * @property {number} pagesProcessed
 * @property {number} chunksCreated
 * @property {number} chunksEmbedded
 * @property {number} [errorCount]
 */
