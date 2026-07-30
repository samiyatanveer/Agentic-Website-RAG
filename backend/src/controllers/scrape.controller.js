/**
 * scrape.controller.js
 * POST /api/scrape               — Start a scrape job (async, returns jobId immediately)
 * POST /api/scrape/sync          — Synchronous single-page scrape (for testing)
 * POST /api/scrape/agent         — Agentic crawl with tool selection
 * GET  /api/scrape/:jobId/status — Poll job progress
 *
 * Phase 3 + 4 + 5: Crawl → then auto-trigger embedding pipeline.
 */

import { createSuccessResponse, handleError } from '../utils/errorHandler.js';
import { crawlWebsite, getCrawlStatus }        from '../services/scraper/crawler.service.js';
import { agentCrawl }                          from '../services/agent/agent.service.js';
import { embedWebsite }                        from '../services/embeddings/pipeline.service.js';
import * as websiteService                     from '../services/database/website.service.js';
import * as scrapeJobService                   from '../services/database/scrapeJob.service.js';
import { normalizeURL }                        from '../utils/urlNormalizer.js';
import { createError }                         from '../utils/errorHandler.js';
import { ERROR_CODES }                         from '../config/constants.js';
import logger                                  from '../utils/logger.js';
import env                                     from '../config/env.js';

// ─── POST /api/scrape ─────────────────────────────────────────────────────────
export async function scrape(req, res) {
  let website = null;
  let job     = null;

  try {
    const { url, options = {} } = req.body;
    logger.info('Scrape request received', { url, options });

    let normalizedUrl;
    try {
      normalizedUrl = normalizeURL(url);
    } catch {
      throw createError(ERROR_CODES.INVALID_URL, `Invalid URL: ${url}`, 400);
    }

    const dup = await websiteService.checkDuplicateWebsite(normalizedUrl);
    if (dup.isDuplicate) {
      return res.status(409).json({
        success: false,
        error: {
          code:       ERROR_CODES.DUPLICATE_URL,
          message:    'This website has already been scraped.',
          websiteId:  dup.websiteId,
          statusCode: 409,
        },
      });
    }

    website = await websiteService.createWebsite(normalizedUrl);
    job     = await scrapeJobService.createScrapeJob(website.id);

    res.status(202).json(createSuccessResponse({
      message:   'Scrape job queued.',
      jobId:     job.id,
      websiteId: website.id,
      statusUrl: `/api/scrape/${job.id}/status`,
    }));

    await scrapeJobService.markJobStarted(job.id);

    crawlThenEmbed(normalizedUrl, website.id, job.id, {
      maxPages:            options.maxPages            ?? env.SCRAPER_MAX_PAGES_PER_DOMAIN,
      skipRobotsCheck:     options.skipRobotsCheck     ?? false,
      followInternalLinks: options.followInternalLinks ?? true,
    });

  } catch (error) {
    if (res.headersSent) {
      logger.error('Post-response scrape error', { error: error.message });
      return;
    }
    return res.status(error.statusCode || 500).json(handleError(error, 'scrape.controller.scrape'));
  }
}

// ─── POST /api/scrape/sync ────────────────────────────────────────────────────
export async function scrapeSync(req, res) {
  try {
    const { url, options = {} } = req.body;
    logger.info('Sync scrape request', { url });

    const result = await crawlWebsite(url, {
      maxPages:            options.maxPages         ?? 5,
      skipRobotsCheck:     options.skipRobotsCheck  ?? false,
      followInternalLinks: options.followLinks       ?? false,
    });

    return res.status(200).json(createSuccessResponse(result));
  } catch (error) {
    return res.status(error.statusCode || 500).json(handleError(error, 'scrape.controller.scrapeSync'));
  }
}

// ─── POST /api/scrape/agent ───────────────────────────────────────────────────
export async function agentScrape(req, res) {
  try {
    const { url, options = {} } = req.body;
    logger.info('Agent scrape request', { url, options });

    agentCrawl(url, {
      maxPages:      options.maxPages      ?? env.SCRAPER_MAX_PAGES_PER_DOMAIN,
      allowDynamic:  options.allowDynamic  ?? true,
      preferSitemap: options.preferSitemap ?? true,
    }).then(async (result) => {
      logger.info('Agent crawl complete', result);
      // Trigger embeddings after agent crawl
      if (result?.websiteId) {
        runEmbeddings(result.websiteId, result.jobId).catch(() => {});
      }
    }).catch((err) => {
      logger.error('Agent crawl error', { url, error: err.message });
    });

    return res.status(202).json(createSuccessResponse({
      message: 'Agentic scrape queued. The agent will select the optimal strategy automatically.',
      url,
      note: 'Query GET /api/websites to find the created website.',
    }));
  } catch (error) {
    return res.status(error.statusCode || 500).json(handleError(error, 'scrape.controller.agentScrape'));
  }
}

// ─── GET /api/scrape/:jobId/status ────────────────────────────────────────────
export async function getStatus(req, res) {
  try {
    const { jobId } = req.params;
    const status = await getCrawlStatus(jobId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: { message: `Job not found: ${jobId}`, statusCode: 404 },
      });
    }

    return res.status(200).json(createSuccessResponse(status));
  } catch (error) {
    return res.status(500).json(handleError(error, 'scrape.controller.getStatus'));
  }
}

export default { scrape, scrapeSync, agentScrape, getStatus };

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function crawlThenEmbed(url, websiteId, jobId, opts) {
  try {
    await crawlWebsite(url, {
      ...opts,
      _existingWebsiteId: websiteId,
      _existingJobId:     jobId,
      finalizeJob:        false,
    });
    await runEmbeddings(websiteId, jobId);
    await scrapeJobService.markJobCompleted(jobId);
  } catch (err) {
    logger.error('Background crawl+embed failed', { url, jobId, error: err.message });
    try {
      await scrapeJobService.markJobFailed(jobId, err.message);
    } catch { /* ignore */ }
  }
}

async function runEmbeddings(websiteId, jobId) {
  try {
    logger.info('[Embeddings] Starting for websiteId', { websiteId });
    const result = await embedWebsite(websiteId, { jobId });
    if (result.chunksEmbedded === 0 && result.pagesProcessed > 0) {
      throw createError(ERROR_CODES.CHROMADB_ERROR, 'No content was indexed for this scrape.', 500);
    }
    logger.info('[Embeddings] Complete for websiteId', { websiteId });
  } catch (err) {
    // Do not report the job as complete when scraped pages could not be
    // indexed; the pages remain saved and can be re-indexed later.
    logger.warn('[Embeddings] Failed; scraped pages were preserved', {
      websiteId,
      error: err.message,
    });
    throw err;
  }
}
