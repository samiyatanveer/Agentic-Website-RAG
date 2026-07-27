/**
 * scrape.routes.js
 * POST /api/scrape              — Start a new scrape job (async, returns jobId)
 * POST /api/scrape/sync         — Synchronous scrape (for tests / small sites)
 * POST /api/scrape/agent        — Agentic scrape with automatic tool selection
 * GET  /api/scrape/:jobId/status — Check job progress
 */

import { Router } from 'express';
import { scrape, scrapeSync, agentScrape, getStatus } from '../controllers/scrape.controller.js';
import { validateScrapeRequest } from '../middleware/validation.middleware.js';

const router = Router();

// Specific routes before parameterized ones
router.post('/sync',  validateScrapeRequest, scrapeSync);
router.post('/agent', validateScrapeRequest, agentScrape);
router.post('/',      validateScrapeRequest, scrape);
router.get('/:jobId/status', getStatus);

export default router;
