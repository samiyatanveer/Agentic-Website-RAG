/**
 * website.routes.js
 * GET    /api/websites      — List all scraped websites
 * GET    /api/websites/:id  — Get website details and stats
 * DELETE /api/websites/:id  — Remove a website
 */

import { Router } from 'express';
import { listWebsites, getWebsite, deleteWebsite } from '../controllers/website.controller.js';

const router = Router();

router.get('/',    listWebsites);
router.get('/:id', getWebsite);
router.delete('/:id', deleteWebsite);

export default router;
