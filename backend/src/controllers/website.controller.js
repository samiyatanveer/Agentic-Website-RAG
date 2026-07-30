/**
 * website.controller.js
 *
 * GET    /api/websites              — List all scraped websites
 * GET    /api/websites/:id          — Get one website with pages
 * POST   /api/websites/:id/reindex  — Re-create embeddings from saved pages
 * DELETE /api/websites/:id          — Delete a website and its data
 */

import {
  createSuccessResponse,
  handleError,
} from '../utils/errorHandler.js';

import * as websiteService
  from '../services/database/website.service.js';

import * as pageService
  from '../services/database/page.service.js';

import * as scrapeJobService
  from '../services/database/scrapeJob.service.js';

import {
  forceReindexWebsite,
  removeWebsiteEmbeddings,
} from '../services/embeddings/pipeline.service.js';
import { crawlWebsite } from '../services/scraper/crawler.service.js';

import logger
  from '../utils/logger.js';

// ─── GET /api/websites ───────────────────────────────────────────────────────

export async function listWebsites(req, res) {
  try {
    const websites =
      await websiteService.getAllWebsites();

    return res.json(
      createSuccessResponse({
        websites,
        total: websites.length,
      })
    );

  } catch (error) {

    return res
      .status(500)
      .json(
        handleError(
          error,
          'website.controller.listWebsites'
        )
      );
  }
}

// ─── GET /api/websites/:id ───────────────────────────────────────────────────

export async function getWebsite(req, res) {
  try {
    const { id } =
      req.params;

    const website =
      await websiteService.getWebsiteById(
        id
      );

    if (!website) {
      return res
        .status(404)
        .json({
          success: false,

          error: {
            message:
              `Website not found: ${id}`,

            statusCode:
              404,
          },
        });
    }

    const pages =
      await pageService
        .getPageSummariesByWebsite(
          id
        );

    const latestJob =
      await scrapeJobService
        .getLatestScrapeJob(
          id
        );

    return res.json(
      createSuccessResponse({
        website,

        pages,

        pageCount:
          pages.length,

        latestJob:
          latestJob ?? null,
      })
    );

  } catch (error) {

    return res
      .status(500)
      .json(
        handleError(
          error,
          'website.controller.getWebsite'
        )
      );
  }
}

// ─── POST /api/websites/:id/reindex ──────────────────────────────────────────

/**
 * Re-create embeddings for an already scraped website.
 *
 * Use this when:
 * - website says "Already scraped"
 * - pages already exist in SQLite
 * - ChromaDB was reset
 * - a new Chroma collection was created
 * - ChromaDB has zero vectors
 */
export async function reindexWebsite(req, res) {
  try {
    const { id } =
      req.params;

    console.log(
      '\n========== WEBSITE REINDEX START =========='
    );

    console.log(
      'Website ID:',
      id
    );

    console.log(
      '===========================================\n'
    );

    // Check that the website exists
    const website =
      await websiteService
        .getWebsiteById(
          id
        );

    if (!website) {
      return res
        .status(404)
        .json({
          success: false,

          error: {
            message:
              `Website not found: ${id}`,

            statusCode:
              404,
          },
        });
    }

    logger.info(
      `[Website] Starting re-index for websiteId=${id}`
    );

    // Read existing pages from SQLite,
    // create chunks, generate embeddings,
    // and insert vectors into ChromaDB.
    const result =
      await forceReindexWebsite(
        id
      );

    logger.info(
      `[Website] Re-index complete for websiteId=${id}`,
      result
    );

    console.log(
      '\n========== WEBSITE REINDEX COMPLETE =========='
    );

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );

    console.log(
      '==============================================\n'
    );

    return res.json(
      createSuccessResponse({
        message:
          'Website successfully re-indexed',

        ...result,
      })
    );

  } catch (error) {

    console.error(
      '\n========== WEBSITE REINDEX ERROR =========='
    );

    console.error(
      'Message:',
      error.message
    );

    console.error(
      'Code:',
      error.code
    );

    console.error(
      'Status:',
      error.statusCode ??
      error.status
    );

    console.error(
      '===========================================\n'
    );

    return res
      .status(
        error.statusCode ??
        error.status ??
        500
      )
      .json(
        handleError(
          error,
          'website.controller.reindexWebsite'
        )
      );
  }
}

// ─── DELETE /api/websites/:id ────────────────────────────────────────────────

export async function deleteWebsite(req, res) {
  try {
    const { id } =
      req.params;

    // Remove vectors before SQLite's cascade removes the chunk IDs needed for
    // cleanup. The Chroma filter is scoped to this website only.
    await removeWebsiteEmbeddings(id);
    logger.info('[Website] Delete cleanup complete', { websiteId: id });

    const deleted =
      await websiteService
        .deleteWebsite(
          id
        );

    if (!deleted) {
      return res
        .status(404)
        .json({
          success: false,

          error: {
            message:
              `Website not found: ${id}`,

            statusCode:
              404,
          },
        });
    }

    return res.json(
      createSuccessResponse({
        deleted:
          true,

        id,
      })
    );

  } catch (error) {

    return res
      .status(500)
      .json(
        handleError(
          error,
          'website.controller.deleteWebsite'
        )
      );
  }
}

// POST /api/websites/:id/rescrape -- explicit refresh of an existing source.
export async function rescrapeWebsite(req, res) {
  try {
    const { id } = req.params;
    const website = await websiteService.getWebsiteById(id);
    if (!website) {
      return res.status(404).json({ success: false, error: { message: `Website not found: ${id}`, statusCode: 404 } });
    }

    const job = await scrapeJobService.createScrapeJob(id);
    await scrapeJobService.markJobStarted(job.id);
    res.status(202).json(createSuccessResponse({
      message: 'Re-scrape job queued.', jobId: job.id, websiteId: id,
      statusUrl: `/api/scrape/${job.id}/status`,
    }));

    // Existing pages remain in place until a successfully fetched replacement
    // is available, preserving previously working content on partial failures.
    crawlWebsite(website.url, {
      _existingWebsiteId: id,
      _existingJobId: job.id,
      finalizeJob: false,
    }).then(async () => {
      await forceReindexWebsite(id);
      await scrapeJobService.markJobCompleted(job.id);
      logger.info('[Website] Re-scrape complete', { websiteId: id, jobId: job.id });
    }).catch(async (error) => {
      logger.warn('[Website] Re-scrape failed; preserved existing content', { websiteId: id, error: error.message });
      await scrapeJobService.markJobFailed(job.id, error.message);
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json(handleError(error, 'website.controller.rescrapeWebsite'));
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default {
  listWebsites,
  getWebsite,
  reindexWebsite,
  rescrapeWebsite,
  deleteWebsite,
};
