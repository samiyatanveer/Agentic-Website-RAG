/**
 * crawler.service.js
 * Multi-page BFS crawler with database integration + scrape job tracking.
 *
 * SRP: Orchestrates multi-page crawl with:
 *   - BFS link queue with deduplication
 *   - robots.txt-aware rate limiting
 *   - scrape_jobs progress tracking
 *   - page + content persistence via DB services
 *   - configurable page limit
 *
 * Does NOT fetch HTML or parse it directly — delegates to scraper.service.
 */

import { scrapePage } from './scraper.service.js';
import { getCrawlDelay } from './robots.service.js';
import * as websiteService  from '../database/website.service.js';
import * as pageService     from '../database/page.service.js';
import * as scrapeJobService from '../database/scrapeJob.service.js';
import { normalizeURL, generateURLHash } from '../../utils/urlNormalizer.js';
import { STATUS, ERROR_CODES } from '../../config/constants.js';
import { createError } from '../../utils/errorHandler.js';
import logger from '../../utils/logger.js';
import sleep from '../../utils/sleep.js';
import env from '../../config/env.js';

/**
 * @typedef {Object} CrawlOptions
 * @property {number}  [maxPages=50]          - Hard cap on pages per crawl
 * @property {boolean} [skipRobotsCheck=false]
 * @property {boolean} [followInternalLinks=true]
 * @property {string}  [userId]               - Optional user who triggered the scrape
 */

/**
 * Crawl a website starting from the given seed URL.
 * Creates or retrieves the website record, creates a scrape job,
 * and crawls pages in BFS order until maxPages is reached or queue is empty.
 *
 * @param {string} seedUrl - The URL submitted by the user
 * @param {CrawlOptions} opts
 * @returns {Promise<{
 *   websiteId: string,
 *   jobId: string,
 *   pagesScraped: number,
 *   duplicateSkipped: boolean,
 *   error?: string
 * }>}
 */
export async function crawlWebsite(seedUrl, opts = {}) {
  const maxPages         = opts.maxPages ?? env.SCRAPER_MAX_PAGES_PER_DOMAIN;
  const skipRobots       = opts.skipRobotsCheck ?? false;
  const followLinks      = opts.followInternalLinks ?? true;
  const userId           = opts.userId ?? null;
  // Pre-created IDs from async controller (avoids duplicate record creation)
  const existingWebsiteId = opts._existingWebsiteId ?? null;
  const existingJobId     = opts._existingJobId     ?? null;

  // ── Normalize seed URL ────────────────────────────────────────────────────
  let normalizedSeed;
  try {
    normalizedSeed = normalizeURL(seedUrl);
  } catch {
    throw createError(ERROR_CODES.INVALID_URL, `Invalid seed URL: ${seedUrl}`, 400);
  }

  const seedOrigin = new URL(normalizedSeed).origin;

  // ── Duplicate website check (skip if controller pre-created the records) ──
  if (!existingWebsiteId) {
    const dupCheck = await websiteService.checkDuplicateWebsite(normalizedSeed);
    if (dupCheck.isDuplicate) {
      logger.info(`Website already scraped: ${normalizedSeed} (id=${dupCheck.websiteId})`);
      return {
        websiteId: dupCheck.websiteId,
        jobId: null,
        pagesScraped: 0,
        duplicateSkipped: true,
      };
    }
  }

  // ── Create or reuse website + job records ────────────────────────────────
  logger.info(`Starting crawl: ${normalizedSeed}`);
  let website, job;
  if (existingWebsiteId && existingJobId) {
    // Reuse pre-created records from the async controller
    website = await websiteService.getWebsiteById(existingWebsiteId);
    job     = await scrapeJobService.getScrapeJob(existingJobId);
  } else {
    website = await websiteService.createWebsite(normalizedSeed, { userId });
    job     = await scrapeJobService.createScrapeJob(website.id);
    await scrapeJobService.markJobStarted(job.id);
  }

  // ── BFS crawl loop ────────────────────────────────────────────────────────
  const visited  = new Set();          // Normalized URLs already processed
  const queue    = [normalizedSeed];   // BFS queue
  let pagesScraped = 0;
  let errorCount   = 0;

  // Get crawl delay for this domain
  let delayMs = env.SCRAPER_REQUEST_DELAY_MS;
  try {
    delayMs = await getCrawlDelay(normalizedSeed);
  } catch { /* use default */ }

  while (queue.length > 0 && pagesScraped < maxPages) {
    const currentUrl = queue.shift();
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    // Update job progress — which URL are we on
    await scrapeJobService.updateScrapeProgress(job.id, {
      current_page_url: currentUrl,
      pages_found:      queue.length + visited.size,
    });

    logger.debug(`Crawling [${pagesScraped + 1}/${maxPages}]: ${currentUrl}`);

    // Scrape the page
    let result;
    try {
      result = await scrapePage(currentUrl, { skipRobotsCheck: skipRobots });
    } catch (err) {
      logger.warn(`Failed to scrape ${currentUrl}: ${err.message} (code=${err.code})`);
      errorCount++;
      await scrapeJobService.incrementJobCounter(job.id, 'error_count');

      // Continue crawl even on non-fatal errors
      if (err.code !== ERROR_CODES.BLOCKED_BY_ROBOTS) {
        continue;
      } else {
        // robots.txt blocked the whole site → abort early
        await scrapeJobService.markJobFailed(job.id, `Blocked by robots.txt: ${currentUrl}`);
        await websiteService.updateWebsite(website.id, { error_message: 'Blocked by robots.txt' });
        return { websiteId: website.id, jobId: job.id, pagesScraped, duplicateSkipped: false, error: 'Blocked by robots.txt' };
      }
    }

    // ── Content-change detection (for re-scrapes in the future) ─────────────
    const { changed, existingPage } = await pageService.hasContentChanged(
      result.url, website.id, result.content
    );

    if (!changed && existingPage) {
      logger.debug(`Content unchanged, skipping persist: ${currentUrl}`);
      pagesScraped++;
      await scrapeJobService.incrementJobCounter(job.id, 'pages_crawled');
      continue;
    }

    // ── Persist page record ──────────────────────────────────────────────────
    try {
      if (existingPage) {
        // Content changed — update
        await pageService.updatePage(existingPage.id, {
          content:      result.content,
          content_hash: result.contentHash,
          title:        result.title || existingPage.title,
          status:       STATUS.PAGE_COMPLETE,
        });
      } else {
        // New page
        await pageService.createPage(
          website.id,
          result.url,
          result.content,
          { title: result.title, status: STATUS.PAGE_COMPLETE }
        );
      }
    } catch (err) {
      logger.warn(`Failed to persist page ${currentUrl}: ${err.message}`);
      errorCount++;
      await scrapeJobService.incrementJobCounter(job.id, 'error_count');
      continue;
    }

    pagesScraped++;
    await scrapeJobService.incrementJobCounter(job.id, 'pages_crawled');
    await scrapeJobService.incrementJobCounter(job.id, 'pages_processed');
    await websiteService.incrementWebsiteStats(website.id, { pages: 1 });

    // Update website title from the seed page
    if (pagesScraped === 1 && result.title) {
      await websiteService.updateWebsite(website.id, {
        title:       result.title,
        description: result.description || null,
      });
    }

    // ── Enqueue internal links ───────────────────────────────────────────────
    if (followLinks) {
      for (const link of result.links) {
        // Only follow same-origin links not yet visited
        if (!visited.has(link) && !queue.includes(link)) {
          try {
            const linkOrigin = new URL(link).origin;
            if (linkOrigin === seedOrigin) {
              queue.push(link);
            }
          } catch { /* malformed link */ }
        }
      }
    }

    // ── Rate limiting ────────────────────────────────────────────────────────
    if (queue.length > 0) {
      await sleep(delayMs);
    }
  }

  // ── Finalize job ─────────────────────────────────────────────────────────
  await scrapeJobService.updateScrapeProgress(job.id, {
    pages_found:    visited.size,
    current_page_url: null,
  });
  await scrapeJobService.markJobCompleted(job.id);

  logger.info(`Crawl complete: ${normalizedSeed} — ${pagesScraped} pages, ${errorCount} errors`);

  return {
    websiteId:        website.id,
    jobId:            job.id,
    pagesScraped,
    duplicateSkipped: false,
  };
}

/**
 * Get the current status of a scrape job.
 * Computes progress percentage on the fly.
 *
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export async function getCrawlStatus(jobId) {
  const job = await scrapeJobService.getScrapeJob(jobId);
  if (!job) return null;

  const { pagesPercent } = scrapeJobService.calculateProgress(job);

  return {
    ...job,
    progress_percent: pagesPercent,
  };
}
