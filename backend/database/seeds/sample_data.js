/**
 * sample_data.js
 * Seed script — inserts representative sample data for local development.
 * Run: node database/seeds/sample_data.js
 *
 * This is NOT for production. Data is idempotent — safe to run multiple times.
 */

import { initializeDatabase, closeDatabase } from '../../src/config/database.js';
import * as websiteService   from '../../src/services/database/website.service.js';
import * as pageService      from '../../src/services/database/page.service.js';
import * as chunkService     from '../../src/services/database/chunk.service.js';
import * as conversationService from '../../src/services/database/conversation.service.js';
import * as messageService   from '../../src/services/database/message.service.js';
import * as scrapeJobService from '../../src/services/database/scrapeJob.service.js';

async function seed() {
  console.log('🌱 Seeding sample data...\n');

  await initializeDatabase();

  // ── Website ──────────────────────────────────────────────────────────────────
  const { isDuplicate, website: existing } = await websiteService.checkDuplicateWebsite('https://docs.example.com');
  let website;

  if (isDuplicate) {
    console.log('⚠️  Website already seeded, skipping creation');
    website = existing;
  } else {
    website = await websiteService.createWebsite('https://docs.example.com', {
      title: 'Example Docs',
      description: 'Sample documentation website for testing',
    });
    console.log(`✅ Created website: ${website.id}`);
  }

  // ── Scrape Job ───────────────────────────────────────────────────────────────
  const existingJobs = await scrapeJobService.getScrapeJobsByWebsite(website.id);
  let job;

  if (existingJobs.length > 0) {
    console.log('⚠️  Scrape job already seeded, skipping');
    job = existingJobs[0];
  } else {
    job = await scrapeJobService.createScrapeJob(website.id);
    await scrapeJobService.markJobStarted(job.id);
    console.log(`✅ Created scrape job: ${job.id}`);
  }

  // ── Pages ────────────────────────────────────────────────────────────────────
  const samplePages = [
    {
      url: 'https://docs.example.com/',
      title: 'Introduction',
      content: 'Welcome to Example Docs. This documentation covers the core concepts, installation, and usage of the Example platform. Getting started is simple — just install the package and follow the quick-start guide.',
    },
    {
      url: 'https://docs.example.com/installation',
      title: 'Installation',
      content: 'To install Example, run: npm install example-sdk. Prerequisites: Node.js 18 or higher. The SDK supports CommonJS and ES Modules. After installation, import the client and configure your API key.',
    },
    {
      url: 'https://docs.example.com/api-reference',
      title: 'API Reference',
      content: 'The Example API exposes REST endpoints for creating, reading, updating, and deleting resources. All requests must include an Authorization header. Rate limits apply at 1000 requests per hour.',
    },
  ];

  const createdPages = [];
  for (const p of samplePages) {
    const { existingPage } = await pageService.hasContentChanged(p.url, website.id, p.content);
    if (!existingPage) {
      const page = await pageService.createPage(website.id, p.url, p.content, { title: p.title });
      console.log(`✅ Created page: ${p.title}`);
      createdPages.push(page);
    } else {
      console.log(`⚠️  Page already seeded: ${p.title}`);
      createdPages.push(existingPage);
    }
  }

  // ── Chunks ───────────────────────────────────────────────────────────────────
  for (const page of createdPages) {
    const existing = await chunkService.getChunksByPage(page.id);
    if (existing.length === 0) {
      const words = page.content.split(' ');
      const chunks = [
        { text: words.slice(0, Math.ceil(words.length / 2)).join(' '), index: 0, tokenCount: Math.ceil(words.length / 2) },
        { text: words.slice(Math.ceil(words.length / 2)).join(' '), index: 1, tokenCount: Math.floor(words.length / 2) },
      ].filter(c => c.text.trim().length > 0);

      await chunkService.createChunks(page.id, website.id, chunks);
      console.log(`✅ Created ${chunks.length} chunks for: ${page.title}`);
    }
  }

  // Update website stats
  const pageCount = await pageService.countPagesByWebsite(website.id);
  const chunkCount = await chunkService.countChunksByWebsite(website.id);
  await websiteService.updateWebsite(website.id, { total_pages: pageCount, total_chunks: chunkCount });

  // Mark job complete
  if (job.status !== 'completed') {
    await scrapeJobService.updateScrapeProgress(job.id, {
      pages_found: pageCount,
      pages_crawled: pageCount,
      pages_processed: pageCount,
      chunks_generated: chunkCount,
    });
    await scrapeJobService.markJobCompleted(job.id);
    console.log('✅ Marked scrape job completed');
  }

  // ── Conversation + Messages ──────────────────────────────────────────────────
  const existingConvos = await conversationService.getConversationsByWebsite(website.id);
  if (existingConvos.length === 0) {
    const convo = await conversationService.createConversation(website.id, {
      title: 'Sample Conversation',
    });
    await messageService.createMessage(convo.id, 'user', 'How do I install the SDK?');
    await messageService.createMessage(convo.id, 'assistant', 'To install Example, run: npm install example-sdk. You need Node.js 18 or higher.', {
      sources: [{ chunkId: 'seed-chunk-1', url: 'https://docs.example.com/installation', text: 'npm install example-sdk' }],
    });
    console.log('✅ Created sample conversation with 2 messages');
  } else {
    console.log('⚠️  Conversation already seeded, skipping');
  }

  console.log('\n🌱 Seeding complete!');
  await closeDatabase();
  process.exit(0);
}

seed().catch((err) => {
  console.error('\n❌ Seeding failed:', err.message);
  process.exit(1);
});
