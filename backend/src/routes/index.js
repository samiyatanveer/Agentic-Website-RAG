/**
 * routes/index.js
 * Central route mounting point.
 * All API routes are registered here and mounted on their prefix.
 *
 * Route map:
 *   GET  /api/health
 *   POST /api/scrape
 *   GET  /api/scrape/:jobId/status
 *   POST /api/chat
 *   GET  /api/websites
 *   GET  /api/websites/:id
 *   DEL  /api/websites/:id
 *   GET  /api/conversations/:id
 *   DEL  /api/conversations/:id
 */

import healthRoutes       from './health.routes.js';
import scrapeRoutes       from './scrape.routes.js';
import chatRoutes         from './chat.routes.js';
import websiteRoutes      from './website.routes.js';
import conversationRoutes from './conversation.routes.js';

export default function mountRoutes(app) {
  app.use('/api/health',        healthRoutes);
  app.use('/api/scrape',        scrapeRoutes);
  app.use('/api/chat',          chatRoutes);
  app.use('/api/websites',      websiteRoutes);
  app.use('/api/conversations',  conversationRoutes);
}
