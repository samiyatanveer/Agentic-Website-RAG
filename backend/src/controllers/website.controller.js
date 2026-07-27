/**
 * website.controller.js
 * GET    /api/websites      — List all scraped websites with stats
 * GET    /api/websites/:id  — Get a single website with pages and job history
 * DELETE /api/websites/:id  — Remove a website and all its data
 *
 * Phase 3+: Connected to website.service, page.service, scrapeJob.service.
 */

import { createSuccessResponse, handleError } from '../utils/errorHandler.js';
import * as websiteService  from '../services/database/website.service.js';
import * as pageService     from '../services/database/page.service.js';
import * as scrapeJobService from '../services/database/scrapeJob.service.js';
import logger from '../utils/logger.js';

export async function listWebsites(req, res) {
  try {
    const websites = await websiteService.getAllWebsites();
    return res.json(createSuccessResponse({
      websites,
      total: websites.length,
    }));
  } catch (error) {
    return res.status(500).json(handleError(error, 'website.controller.listWebsites'));
  }
}

export async function getWebsite(req, res) {
  try {
    const { id } = req.params;
    const website = await websiteService.getWebsiteById(id);

    if (!website) {
      return res.status(404).json({
        success: false,
        error: { message: `Website not found: ${id}`, statusCode: 404 },
      });
    }

    // Include page summaries and latest job for context
    const pages  = await pageService.getPageSummariesByWebsite(id);
    const latestJob = await scrapeJobService.getLatestScrapeJob(id);

    return res.json(createSuccessResponse({
      website,
      pages,
      pageCount: pages.length,
      latestJob: latestJob || null,
    }));
  } catch (error) {
    return res.status(500).json(handleError(error, 'website.controller.getWebsite'));
  }
}

export async function deleteWebsite(req, res) {
  try {
    const { id } = req.params;
    const deleted = await websiteService.deleteWebsite(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: { message: `Website not found: ${id}`, statusCode: 404 },
      });
    }

    return res.json(createSuccessResponse({ deleted: true, id }));
  } catch (error) {
    return res.status(500).json(handleError(error, 'website.controller.deleteWebsite'));
  }
}

export default { listWebsites, getWebsite, deleteWebsite };
