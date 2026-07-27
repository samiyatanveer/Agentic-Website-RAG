/**
 * agent.service.js
 * Agentic scraping orchestrator — the "brain" of Phase 4.
 *
 * Architecture:
 *   Scrape Request
 *     ↓
 *   analyzeWebsite()        — determine strategy (static / dynamic / sitemap)
 *     ↓
 *   selectTool()            — pick from controlled tool registry
 *     ↓
 *   executeTool()           — run the tool
 *     ↓
 *   evaluateResult()        — is the content sufficient? should we escalate?
 *     ↓
 *   persistResult()         — store via DB services
 *     ↓
 *   continue / stop / switch strategy
 *
 * The agent ONLY calls predefined tools from the tools/ directory.
 * It does NOT execute arbitrary code, eval(), or spawn subprocesses.
 *
 * SRP: Agent logic only — no HTTP, no HTML parsing, no DB queries directly.
 */

import * as robotsTool          from './tools/robots.tool.js';
import * as duplicateCheckTool  from './tools/duplicateCheck.tool.js';
import * as fetchStaticPageTool from './tools/fetchStaticPage.tool.js';
import * as renderDynamicTool   from './tools/renderDynamicPage.tool.js';
import * as extractContentTool  from './tools/extractContent.tool.js';
import * as discoverLinksTool   from './tools/discoverLinks.tool.js';
import * as sitemapTool         from './tools/sitemap.tool.js';

import * as websiteService   from '../database/website.service.js';
import * as pageService      from '../database/page.service.js';
import * as scrapeJobService from '../database/scrapeJob.service.js';

import { normalizeURL }    from '../../utils/urlNormalizer.js';
import { STATUS, ERROR_CODES } from '../../config/constants.js';
import { createError }     from '../../utils/errorHandler.js';
import logger              from '../../utils/logger.js';
import sleep               from '../../utils/sleep.js';
import env                 from '../../config/env.js';

// ─── Strategy Constants ────────────────────────────────────────────────────────

/** Minimum word count to consider a page successfully scraped */
const MIN_WORD_COUNT = 50;

/** Strategies the agent can employ */
const STRATEGY = {
  STATIC:       'static',       // axios fetch + Cheerio
  DYNAMIC:      'dynamic',      // Puppeteer headless Chrome
  SITEMAP:      'sitemap',      // Use sitemap.xml for URL discovery
  SKIP:         'skip',         // Content unchanged or duplicate
  ABORT:        'abort',        // Fatal error (robots blocked, invalid URL)
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run a full agentic crawl starting from a seed URL.
 * Creates all required DB records and tracks progress via scrape_jobs.
 *
 * @param {string} seedUrl
 * @param {{
 *   maxPages?: number,
 *   userId?: string,
 *   preferSitemap?: boolean,
 *   allowDynamic?: boolean,
 * }} opts
 * @returns {Promise<AgentResult>}
 */
export async function agentCrawl(seedUrl, opts = {}) {
  const maxPages     = opts.maxPages     ?? env.SCRAPER_MAX_PAGES_PER_DOMAIN;
  const allowDynamic = opts.allowDynamic ?? true;
  const preferSitemap = opts.preferSitemap ?? true;

  // 1. Normalize seed URL
  let normalizedSeed;
  try {
    normalizedSeed = normalizeURL(seedUrl);
  } catch {
    throw createError(ERROR_CODES.INVALID_URL, `Invalid URL: ${seedUrl}`, 400);
  }

  logger.info(`[Agent] Starting agentic crawl: ${normalizedSeed}`);

  // 2. Check for website-level duplicate
  const dupCheck = await duplicateCheckTool.checkWebsiteDuplicate(normalizedSeed);
  if (dupCheck.data?.isDuplicate) {
    logger.info(`[Agent] Duplicate website — skipping: ${normalizedSeed}`);
    return {
      status: STRATEGY.SKIP,
      websiteId: dupCheck.data.websiteId,
      jobId: null,
      pagesScraped: 0,
      strategy: STRATEGY.SKIP,
      reason: 'Website already scraped',
    };
  }

  // 3. Check robots.txt
  const robotsResult = await robotsTool.run(normalizedSeed);
  if (!robotsResult.data?.allowed) {
    throw createError(ERROR_CODES.BLOCKED_BY_ROBOTS, `Blocked by robots.txt: ${normalizedSeed}`, 403);
  }
  const crawlDelayMs = robotsResult.data?.crawlDelayMs ?? env.SCRAPER_REQUEST_DELAY_MS;

  // 4. Create website record + scrape job
  const website = await websiteService.createWebsite(normalizedSeed, { userId: opts.userId });
  const job     = await scrapeJobService.createScrapeJob(website.id);
  await scrapeJobService.markJobStarted(job.id);

  logger.info(`[Agent] Website ID=${website.id}, Job ID=${job.id}`);

  // 5. Decide initial strategy
  let strategy = await analyzeWebsite(normalizedSeed, allowDynamic);
  logger.info(`[Agent] Initial strategy: ${strategy}`);

  // 6. Determine URL queue
  const urlQueue = new Set([normalizedSeed]);
  let   visited  = new Set();

  // Try sitemap first if preferred
  if (preferSitemap && strategy !== STRATEGY.ABORT) {
    const sitemapResult = await sitemapTool.run(normalizedSeed);
    if (sitemapResult.data?.found && sitemapResult.data.count > 0) {
      logger.info(`[Agent] Sitemap found: ${sitemapResult.data.count} URLs`);
      for (const u of sitemapResult.data.urls.slice(0, maxPages)) {
        urlQueue.add(u);
      }
      await scrapeJobService.updateScrapeProgress(job.id, {
        pages_found: urlQueue.size,
      });
    }
  }

  // 7. BFS crawl loop
  let pagesScraped = 0;
  let errorCount   = 0;
  const queueArr   = [...urlQueue];

  for (let i = 0; i < queueArr.length && pagesScraped < maxPages; i++) {
    const currentUrl = queueArr[i];
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);

    logger.debug(`[Agent] Processing [${pagesScraped + 1}/${maxPages}]: ${currentUrl}`);

    await scrapeJobService.updateScrapeProgress(job.id, {
      current_page_url: currentUrl,
      pages_found: Math.max(queueArr.length, visited.size),
    });

    // Per-page processing
    const pageResult = await processPage(currentUrl, website.id, strategy, allowDynamic);

    if (pageResult.status === 'skip') {
      logger.debug(`[Agent] Skip: ${currentUrl} — ${pageResult.reason}`);
      continue;
    }

    if (pageResult.status === 'error') {
      logger.warn(`[Agent] Error on ${currentUrl}: ${pageResult.error}`);
      errorCount++;
      await scrapeJobService.incrementJobCounter(job.id, 'error_count');
      continue;
    }

    // Persist the page
    if (pageResult.content) {
      try {
        const { changed, existingPage } = await pageService.hasContentChanged(
          currentUrl, website.id, pageResult.content.content
        );

        if (!changed && existingPage) {
          logger.debug(`[Agent] Content unchanged: ${currentUrl}`);
        } else {
          if (existingPage) {
            await pageService.updatePage(existingPage.id, {
              content: pageResult.content.content,
              content_hash: pageResult.content.contentHash,
              title: pageResult.content.title || existingPage.title,
              status: STATUS.PAGE_COMPLETE,
            });
          } else {
            await pageService.createPage(
              website.id,
              currentUrl,
              pageResult.content.content,
              { title: pageResult.content.title, status: STATUS.PAGE_COMPLETE }
            );
          }
          pagesScraped++;
          await scrapeJobService.incrementJobCounter(job.id, 'pages_crawled');
          await scrapeJobService.incrementJobCounter(job.id, 'pages_processed');
          await websiteService.incrementWebsiteStats(website.id, { pages: 1 });

          // Set website title from first page
          if (pagesScraped === 1 && pageResult.content.title) {
            await websiteService.updateWebsite(website.id, {
              title: pageResult.content.title,
              description: pageResult.content.description || null,
            });
          }
        }
      } catch (err) {
        logger.warn(`[Agent] DB persist failed for ${currentUrl}: ${err.message}`);
        errorCount++;
      }
    }

    // Enqueue new internal links if we haven't gone through sitemap
    if (pageResult.links) {
      const seedOrigin = new URL(normalizedSeed).origin;
      for (const link of pageResult.links) {
        if (!visited.has(link) && !queueArr.includes(link)) {
          try {
            if (new URL(link).origin === seedOrigin) {
              queueArr.push(link);
            }
          } catch { /* malformed */ }
        }
      }
    }

    // Rate limiting
    if (i < queueArr.length - 1) {
      await sleep(crawlDelayMs);
    }
  }

  // 8. Mark job complete
  await scrapeJobService.updateScrapeProgress(job.id, {
    pages_found: visited.size,
    current_page_url: null,
  });
  await scrapeJobService.markJobCompleted(job.id);

  logger.info(`[Agent] Crawl complete: ${pagesScraped} pages, ${errorCount} errors, strategy=${strategy}`);

  return {
    status: 'completed',
    websiteId: website.id,
    jobId: job.id,
    pagesScraped,
    errorCount,
    strategy,
    reason: null,
  };
}

// ─── Internal: Per-page processing ───────────────────────────────────────────

/**
 * Process a single page through the agent tool pipeline.
 * Returns structured result: { status, content, links, error, reason }
 *
 * @param {string} url
 * @param {string} websiteId
 * @param {string} strategy
 * @param {boolean} allowDynamic
 */
async function processPage(url, websiteId, strategy, allowDynamic) {
  // Step 1: Fetch the page
  let fetchResult;

  if (strategy === STRATEGY.STATIC) {
    fetchResult = await fetchStaticPageTool.run(url);
  } else if (strategy === STRATEGY.DYNAMIC) {
    fetchResult = await renderDynamicTool.run(url);
    // If dynamic fails, fall back to static
    if (!fetchResult.success) {
      logger.warn(`[Agent] Dynamic render failed for ${url}, falling back to static`);
      fetchResult = await fetchStaticPageTool.run(url);
    }
  } else {
    fetchResult = await fetchStaticPageTool.run(url);
  }

  if (!fetchResult.success || !fetchResult.data?.html) {
    return { status: 'error', error: fetchResult.error || 'Fetch failed', links: [] };
  }

  const { html, finalUrl, isJsHeavy } = fetchResult.data;

  // Step 2: Escalate to dynamic if page appears JS-heavy and dynamic is allowed
  let finalHtml = html;
  if (isJsHeavy && allowDynamic && strategy !== STRATEGY.DYNAMIC) {
    logger.debug(`[Agent] Escalating to dynamic render: ${url}`);
    const dynamicResult = await renderDynamicTool.run(url);
    if (dynamicResult.success && dynamicResult.data?.html) {
      finalHtml = dynamicResult.data.html;
    }
    // If Puppeteer fails, continue with static HTML
  }

  // Step 3: Extract content
  const extractResult = await extractContentTool.run(finalHtml, finalUrl || url);
  if (!extractResult.success || !extractResult.data) {
    return {
      status: 'error',
      error: extractResult.error || 'Content extraction failed',
      links: [],
    };
  }

  const content = extractResult.data;

  // Step 4: Quality check
  if (content.wordCount < MIN_WORD_COUNT) {
    return {
      status: 'skip',
      reason: `Content too sparse (${content.wordCount} words)`,
      links: content.links || [],
    };
  }

  // Step 5: Discover links (already in content.links from extractContent)
  return {
    status: 'ok',
    content,
    links: content.links || [],
  };
}

// ─── Internal: Strategy analysis ─────────────────────────────────────────────

/**
 * Analyze a website to determine the optimal scraping strategy.
 * Does a lightweight static fetch and inspects the result.
 *
 * @param {string} url
 * @param {boolean} allowDynamic
 * @returns {Promise<string>} One of STRATEGY.*
 */
async function analyzeWebsite(url, allowDynamic) {
  const fetchResult = await fetchStaticPageTool.run(url, { timeout: 15000 });

  if (!fetchResult.success) {
    // If fetch totally fails, still try — maybe it's a redirect or slow start
    return STRATEGY.STATIC;
  }

  const { isJsHeavy } = fetchResult.data;

  if (isJsHeavy && allowDynamic && renderDynamicTool.isAvailable()) {
    return STRATEGY.DYNAMIC;
  }

  return STRATEGY.STATIC;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Strategy constants exposed for tests and controller */
export { STRATEGY };
