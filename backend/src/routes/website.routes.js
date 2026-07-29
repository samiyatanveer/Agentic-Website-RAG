/**
 * website.routes.js
 *
 * GET    /api/websites              — List all scraped websites
 * GET    /api/websites/:id          — Get website details and stats
 * POST   /api/websites/:id/reindex  — Re-create embeddings from saved pages
 * DELETE /api/websites/:id          — Remove a website
 */

import { Router } from 'express';

import {
  listWebsites,
  getWebsite,
  reindexWebsite,
  deleteWebsite,
} from '../controllers/website.controller.js';

const router = Router();

// ─── Website routes ──────────────────────────────────────────────────────────

router.get('/', listWebsites);

// IMPORTANT:
// Put /:id/reindex BEFORE /:id.
// Otherwise Express may treat "reindex" as an ID in some route setups.
router.post('/:id/reindex', reindexWebsite);

router.get('/:id', getWebsite);

router.delete('/:id', deleteWebsite);

export default router;