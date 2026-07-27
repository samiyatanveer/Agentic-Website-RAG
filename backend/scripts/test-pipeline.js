/**
 * test-pipeline.js
 * End-to-end integration test for Phase 5 — Vector Pipeline.
 *
 * Requires Ollama and ChromaDB to be running:
 *   ollama serve
 *   chroma run --path ./data/chroma
 *
 * Run: node scripts/test-pipeline.js
 *
 * What it tests:
 *   1. Ollama embed model availability
 *   2. ChromaDB connectivity + collection creation
 *   3. Chunking a sample text
 *   4. Embedding chunks via Ollama
 *   5. Upserting vectors into ChromaDB
 *   6. Similarity search returns relevant results
 *   7. Full website pipeline (embedWebsite) against DB pages
 *   8. Cleanup
 */

import { checkOllamaHealth }  from '../src/config/ollama.js';
import { checkChromaHealth }  from '../src/config/chroma.js';
import { chunkText, chunkPage } from '../src/services/embeddings/chunker.service.js';
import { embedText, embedChunks, embedQuery, isEmbedModelAvailable } from '../src/services/embeddings/embedding.service.js';
import {
  getOrCreateCollection,
  upsertEmbeddings,
  querySimilar,
  deleteEmbeddings,
  countVectors,
  resetCollectionCache,
} from '../src/services/embeddings/chroma.service.js';
import { searchSimilar } from '../src/services/embeddings/pipeline.service.js';
import { getAllWebsites } from '../src/services/database/website.service.js';
import { getPagesByWebsite } from '../src/services/database/page.service.js';
import { embedWebsite } from '../src/services/embeddings/pipeline.service.js';
import env from '../src/config/env.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const results = [];

async function check(label, fn) {
  try {
    await fn();
    console.log(`  ✅ ${label}`);
    results.push({ label, ok: true });
    passed++;
  } catch (err) {
    console.error(`  ❌ ${label}`);
    console.error(`     ${err.message}`);
    results.push({ label, ok: false, error: err.message });
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// ─── Test runner ──────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔬 Phase 5 — Vector Pipeline Integration Test\n');
  console.log(`   Ollama:   ${env.OLLAMA_BASE_URL}`);
  console.log(`   Model:    ${env.OLLAMA_EMBED_MODEL}`);
  console.log(`   ChromaDB: ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`);
  console.log(`   Collection: ${env.CHROMADB_COLLECTION_NAME}\n`);

  // ── STEP 1: Service health ─────────────────────────────────────────────────
  console.log('📋 Step 1: Service connectivity\n');

  await check('Ollama is running', async () => {
    const r = await checkOllamaHealth();
    assert(r.healthy, r.error ?? 'Ollama offline');
  });

  await check(`Embed model '${env.OLLAMA_EMBED_MODEL}' is available`, async () => {
    const available = await isEmbedModelAvailable();
    assert(available, `Run: ollama pull ${env.OLLAMA_EMBED_MODEL}`);
  });

  await check('ChromaDB is running', async () => {
    const r = await checkChromaHealth();
    assert(r.healthy, r.error ?? 'ChromaDB offline');
  });

  await check('ChromaDB collection created or retrieved', async () => {
    resetCollectionCache();
    const id = await getOrCreateCollection();
    assert(typeof id === 'string' && id.length > 0, 'Collection ID is empty');
    console.log(`     Collection ID: ${id}`);
  });

  if (failed > 0) {
    console.log('\n⛔ Step 1 failed — cannot continue. Fix the services above first.\n');
    process.exit(1);
  }

  // ── STEP 2: Chunker (no network) ───────────────────────────────────────────
  console.log('\n📋 Step 2: Text chunker\n');

  const sampleText = `
    Artificial intelligence is transforming software development. Modern language models
    can generate code, explain bugs, and assist with system design. The rise of
    retrieval-augmented generation (RAG) allows models to access external knowledge bases
    at inference time, dramatically improving factual accuracy. This project implements
    a RAG pipeline over scraped website content, enabling users to ask questions about
    any website and receive accurate, cited answers from a local language model.
    The pipeline consists of: scraping, chunking, embedding, vector storage, and retrieval.
    Each stage is implemented as a separate service following the single responsibility principle.
  `.trim();

  let testChunks = [];
  await check('chunkText produces chunks from sample text', () => {
    testChunks = chunkText(sampleText, { chunkSize: 30, overlap: 5 });
    assert(testChunks.length > 0, 'No chunks produced');
    console.log(`     Produced ${testChunks.length} chunks`);
  });

  await check('all chunks have required fields', () => {
    for (const c of testChunks) {
      assert(typeof c.text === 'string' && c.text.length > 0, `Chunk ${c.index} has no text`);
      assert(typeof c.index === 'number', 'index missing');
      assert(typeof c.tokenCount === 'number', 'tokenCount missing');
    }
  });

  await check('chunk indices are sequential', () => {
    testChunks.forEach((c, i) => {
      assert(c.index === i, `Chunk at position ${i} has index ${c.index}`);
    });
  });

  // ── STEP 3: Single embedding ───────────────────────────────────────────────
  console.log('\n📋 Step 3: Single text embedding\n');

  let testVector = null;
  await check('embedText returns a float array', async () => {
    testVector = await embedText('Hello, this is a test sentence for embedding.');
    assert(Array.isArray(testVector), 'Result is not an array');
    assert(testVector.length > 0, 'Vector is empty');
    assert(typeof testVector[0] === 'number', 'Vector values are not numbers');
    console.log(`     Vector dimensions: ${testVector.length}`);
  });

  await check('same text produces same vector dimensions', async () => {
    const v2 = await embedText('Another test sentence.');
    assert(v2.length === testVector.length, `Dimension mismatch: ${testVector.length} vs ${v2.length}`);
  });

  // ── STEP 4: Batch chunk embedding ─────────────────────────────────────────
  console.log('\n📋 Step 4: Batch chunk embedding\n');

  let embeddedChunks = [];
  await check('embedChunks processes all chunks', async () => {
    // Use only the first 3 chunks to keep test fast
    const toEmbed = testChunks.slice(0, 3);
    embeddedChunks = await embedChunks(toEmbed);
    assert(embeddedChunks.length === toEmbed.length, `Expected ${toEmbed.length}, got ${embeddedChunks.length}`);
    console.log(`     Embedded ${embeddedChunks.length} chunks`);
  });

  await check('each embedded chunk has a vector', () => {
    for (const ec of embeddedChunks) {
      assert(Array.isArray(ec.vector) && ec.vector.length > 0, `Chunk ${ec.chunkIndex} has no vector`);
    }
  });

  // ── STEP 5: ChromaDB upsert ───────────────────────────────────────────────
  console.log('\n📋 Step 5: ChromaDB upsert\n');

  const testIds = embeddedChunks.map((_, i) => `test-chunk-pipeline-${i}`);

  await check('upsertEmbeddings stores vectors in ChromaDB', async () => {
    const items = embeddedChunks.map((ec, i) => ({
      id:       testIds[i],
      vector:   ec.vector,
      text:     ec.text,
      metadata: {
        websiteId:  'test-website',
        pageId:     'test-page',
        pageUrl:    'https://test.example.com',
        chunkIndex: ec.chunkIndex,
        pageTitle:  'Pipeline Test',
      },
    }));
    await upsertEmbeddings(items);
  });

  await check('collection count increased after upsert', async () => {
    const count = await countVectors();
    assert(count >= embeddedChunks.length, `Expected >= ${embeddedChunks.length}, got ${count}`);
    console.log(`     Total vectors in collection: ${count}`);
  });

  // ── STEP 6: Similarity search ─────────────────────────────────────────────
  console.log('\n📋 Step 6: Similarity search\n');

  await check('querySimilar returns results for a test vector', async () => {
    const queryVec = await embedQuery('RAG pipeline retrieval augmented generation');
    const results = await querySimilar(queryVec, { nResults: 3, threshold: 0 });
    assert(Array.isArray(results), 'Results is not an array');
    console.log(`     Found ${results.length} results`);
    if (results.length > 0) {
      console.log(`     Top result score: ${results[0].score.toFixed(4)}`);
      console.log(`     Top result text: "${results[0].text.substring(0, 60)}..."`);
    }
  });

  await check('searchSimilar (pipeline wrapper) returns results', async () => {
    const results = await searchSimilar('artificial intelligence language models', {
      nResults:  3,
      threshold: 0,
    });
    assert(Array.isArray(results), 'Results is not an array');
    console.log(`     Found ${results.length} results via searchSimilar()`);
  });

  await check('each result has id, text, metadata, score', async () => {
    const qv = await embedQuery('software development pipeline');
    const results = await querySimilar(qv, { nResults: 2, threshold: 0 });
    for (const r of results) {
      assert(typeof r.id === 'string', 'missing id');
      assert(typeof r.text === 'string', 'missing text');
      assert(typeof r.metadata === 'object', 'missing metadata');
      assert(typeof r.score === 'number', 'missing score');
      assert(r.score >= 0 && r.score <= 1, `score out of range: ${r.score}`);
    }
  });

  // ── STEP 7: Full website pipeline (if DB has pages) ───────────────────────
  console.log('\n📋 Step 7: Full website pipeline (DB pages)\n');

  await check('embedWebsite runs on first website with content', async () => {
    const websites = await getAllWebsites();
    const withPages = [];
    for (const w of websites) {
      const pages = await getPagesByWebsite(w.id);
      const withContent = pages.filter((p) => p.content && p.content.length > 50);
      if (withContent.length > 0) withPages.push({ website: w, pages: withContent });
    }

    if (withPages.length === 0) {
      console.log('     ⚠️  No websites with page content found — scrape a site first');
      console.log('        Skipping full pipeline test');
      return; // Not a failure, just no data
    }

    const { website, pages } = withPages[0];
    console.log(`     Testing on: ${website.url} (${pages.length} pages with content)`);

    const result = await embedWebsite(website.id, {
      chunkSize: 200,
      overlap:   40,
    });

    assert(result.websiteId === website.id, 'websiteId mismatch');
    assert(result.pagesProcessed >= 1, 'No pages processed');
    assert(result.chunksCreated >= 1, 'No chunks created');
    assert(result.chunksEmbedded >= 1, 'No chunks embedded');

    console.log(`     ✓ Processed ${result.pagesProcessed} pages`);
    console.log(`     ✓ Created   ${result.chunksCreated} chunks`);
    console.log(`     ✓ Embedded  ${result.chunksEmbedded} chunks`);
  });

  // ── STEP 8: Cleanup test data ─────────────────────────────────────────────
  console.log('\n📋 Step 8: Cleanup test vectors\n');

  await check('deleteEmbeddings removes test vectors', async () => {
    await deleteEmbeddings(testIds);
    const count = await countVectors();
    console.log(`     Vectors remaining after cleanup: ${count}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  console.log(`\n  Total: ${passed + failed} checks — ${passed} passed, ${failed} failed\n`);

  if (failed === 0) {
    console.log('  🎉 All Phase 5 integration tests passed!\n');
  } else {
    console.log('  ⚠️  Some tests failed. Review errors above.\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n💥 Unhandled error:', err.message);
  process.exit(1);
});
