/**
 * embeddings.test.js
 * Unit tests for Phase 5 — Vector Pipeline.
 *
 * Tests chunker.service offline (pure functions, no network).
 * Tests chroma.service and embedding.service module contracts.
 * Embedding + ChromaDB integration tests are in scripts/test-pipeline.js
 * (require Ollama + ChromaDB running).
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  chunkText,
  chunkPage,
  estimateChunkCount,
} from '../src/services/embeddings/chunker.service.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// 200 unique words to create multi-chunk content reliably
const WORD_200 = Array.from({ length: 200 }, (_, i) => `word${i + 1}`).join(' ');
const WORD_50  = Array.from({ length: 50  }, (_, i) => `token${i + 1}`).join(' ');
const SHORT    = 'This is a short text with only a handful of words.';

const SAMPLE_PAGE = {
  id:         'page-test-001',
  website_id: 'site-test-001',
  url:        'https://example.com/page',
  title:      'Test Page',
  content:    WORD_200,
};

// ─── chunkText ────────────────────────────────────────────────────────────────

describe('chunkText — basic behavior', () => {
  test('returns empty array for null input', () => {
    expect(chunkText(null)).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(chunkText('')).toEqual([]);
  });

  test('returns empty array for whitespace-only string', () => {
    expect(chunkText('   \n\t  ')).toEqual([]);
  });

  test('returns single chunk when text fits within chunkSize', () => {
    const chunks = chunkText(WORD_50, { chunkSize: 512, overlap: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
  });

  test('returns multiple chunks when text exceeds chunkSize', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 100, overlap: 20 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  test('all chunks have required fields', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 80, overlap: 20 });
    for (const chunk of chunks) {
      expect(typeof chunk.text).toBe('string');
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(typeof chunk.index).toBe('number');
      expect(typeof chunk.tokenCount).toBe('number');
      expect(typeof chunk.charStart).toBe('number');
      expect(typeof chunk.charEnd).toBe('number');
    }
  });

  test('chunk indices are sequential starting from 0', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 80, overlap: 20 });
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  test('each chunk text is a non-empty string', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 80, overlap: 20 });
    for (const chunk of chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
    }
  });

  test('tokenCount is approximately the word count', () => {
    const chunks = chunkText(WORD_50, { chunkSize: 512, overlap: 0 });
    expect(chunks[0].tokenCount).toBeCloseTo(50, -1); // within 10
  });

  test('charStart of first chunk is >= 0', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 80, overlap: 20 });
    expect(chunks[0].charStart).toBeGreaterThanOrEqual(0);
  });
});

describe('chunkText — overlap behavior', () => {
  test('chunks with overlap share words between consecutive chunks', () => {
    const text = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text, { chunkSize: 10, overlap: 5 });

    expect(chunks.length).toBeGreaterThan(1);

    // First chunk words
    const firstWords = new Set(chunks[0].text.split(' '));
    const secondWords = new Set(chunks[1].text.split(' '));
    const sharedWords = [...firstWords].filter((w) => secondWords.has(w));

    // With 10-word chunks and 5-word overlap, there should be ~5 shared words
    expect(sharedWords.length).toBeGreaterThan(0);
  });

  test('throws when overlap >= chunkSize', () => {
    expect(() => chunkText(WORD_200, { chunkSize: 50, overlap: 50 })).toThrow();
    expect(() => chunkText(WORD_200, { chunkSize: 50, overlap: 60 })).toThrow();
  });

  test('works with zero overlap', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 50, overlap: 0 });
    expect(chunks.length).toBe(4); // 200 / 50 = 4
  });

  test('total words covered >= original word count (with overlap)', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 80, overlap: 20 });
    const totalWords = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    expect(totalWords).toBeGreaterThanOrEqual(200);
  });
});

describe('chunkText — edge cases', () => {
  test('single word text returns one chunk', () => {
    const chunks = chunkText('hello');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('hello');
    expect(chunks[0].index).toBe(0);
  });

  test('exactly chunkSize words returns one chunk', () => {
    const exactly100 = Array.from({ length: 100 }, (_, i) => `x${i}`).join(' ');
    const chunks = chunkText(exactly100, { chunkSize: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
  });

  test('very large overlap still produces valid chunks', () => {
    const text = Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text, { chunkSize: 20, overlap: 19 });
    // stride = 1, so many chunks
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.trim()).not.toBe('');
    }
  });

  test('preserves all words from input (no words lost with zero overlap)', () => {
    const chunks = chunkText(WORD_200, { chunkSize: 50, overlap: 0 });
    const allText = chunks.map((c) => c.text).join(' ');
    // All 200 words should appear in the output
    for (let i = 1; i <= 200; i++) {
      expect(allText).toContain(`word${i}`);
    }
  });
});

// ─── chunkPage ────────────────────────────────────────────────────────────────

describe('chunkPage — metadata attachment', () => {
  test('attaches pageId to every chunk', () => {
    const chunks = chunkPage(SAMPLE_PAGE, { chunkSize: 80, overlap: 20 });
    for (const c of chunks) {
      expect(c.pageId).toBe('page-test-001');
    }
  });

  test('attaches websiteId to every chunk', () => {
    const chunks = chunkPage(SAMPLE_PAGE, { chunkSize: 80, overlap: 20 });
    for (const c of chunks) {
      expect(c.websiteId).toBe('site-test-001');
    }
  });

  test('attaches pageUrl to every chunk', () => {
    const chunks = chunkPage(SAMPLE_PAGE, { chunkSize: 80, overlap: 20 });
    for (const c of chunks) {
      expect(c.pageUrl).toBe('https://example.com/page');
    }
  });

  test('attaches pageTitle to every chunk', () => {
    const chunks = chunkPage(SAMPLE_PAGE, { chunkSize: 80, overlap: 20 });
    for (const c of chunks) {
      expect(c.pageTitle).toBe('Test Page');
    }
  });

  test('returns empty array for page with no content', () => {
    const emptyPage = { ...SAMPLE_PAGE, content: '' };
    expect(chunkPage(emptyPage)).toEqual([]);
  });

  test('returns empty array for page with null content', () => {
    const nullPage = { ...SAMPLE_PAGE, content: null };
    expect(chunkPage(nullPage)).toEqual([]);
  });

  test('handles page with undefined title gracefully', () => {
    const noTitle = { ...SAMPLE_PAGE, title: undefined };
    const chunks = chunkPage(noTitle);
    for (const c of chunks) {
      expect(c.pageTitle).toBe('');
    }
  });
});

// ─── estimateChunkCount ───────────────────────────────────────────────────────

describe('estimateChunkCount', () => {
  test('returns 0 for null/empty input', () => {
    expect(estimateChunkCount(null)).toBe(0);
    expect(estimateChunkCount('')).toBe(0);
  });

  test('returns 1 when text fits in one chunk', () => {
    expect(estimateChunkCount(WORD_50, { chunkSize: 512, overlap: 100 })).toBe(1);
  });

  test('estimate matches actual chunk count (zero overlap)', () => {
    const estimate = estimateChunkCount(WORD_200, { chunkSize: 50, overlap: 0 });
    const actual   = chunkText(WORD_200, { chunkSize: 50, overlap: 0 }).length;
    expect(estimate).toBe(actual);
  });

  test('estimate is >= actual chunk count (with overlap)', () => {
    const estimate = estimateChunkCount(WORD_200, { chunkSize: 80, overlap: 20 });
    const actual   = chunkText(WORD_200, { chunkSize: 80, overlap: 20 }).length;
    // Estimate should be close (within 1-2 chunks of actual)
    expect(Math.abs(estimate - actual)).toBeLessThanOrEqual(2);
  });
});

// ─── Module contract tests (no network) ──────────────────────────────────────

describe('embedding.service — module exports', () => {
  test('exports embedText function', async () => {
    const mod = await import('../src/services/embeddings/embedding.service.js');
    expect(typeof mod.embedText).toBe('function');
  });

  test('exports embedChunks function', async () => {
    const mod = await import('../src/services/embeddings/embedding.service.js');
    expect(typeof mod.embedChunks).toBe('function');
  });

  test('exports embedQuery function', async () => {
    const mod = await import('../src/services/embeddings/embedding.service.js');
    expect(typeof mod.embedQuery).toBe('function');
  });

  test('exports isEmbedModelAvailable function', async () => {
    const mod = await import('../src/services/embeddings/embedding.service.js');
    expect(typeof mod.isEmbedModelAvailable).toBe('function');
  });
});

describe('chroma.service — module exports', () => {
  test('exports getOrCreateCollection', async () => {
    const mod = await import('../src/services/embeddings/chroma.service.js');
    expect(typeof mod.getOrCreateCollection).toBe('function');
  });

  test('exports upsertEmbeddings', async () => {
    const mod = await import('../src/services/embeddings/chroma.service.js');
    expect(typeof mod.upsertEmbeddings).toBe('function');
  });

  test('exports querySimilar', async () => {
    const mod = await import('../src/services/embeddings/chroma.service.js');
    expect(typeof mod.querySimilar).toBe('function');
  });

  test('exports deleteEmbeddings', async () => {
    const mod = await import('../src/services/embeddings/chroma.service.js');
    expect(typeof mod.deleteEmbeddings).toBe('function');
  });

  test('exports countVectors', async () => {
    const mod = await import('../src/services/embeddings/chroma.service.js');
    expect(typeof mod.countVectors).toBe('function');
  });
});

describe('pipeline.service — module exports', () => {
  test('exports embedWebsite', async () => {
    const mod = await import('../src/services/embeddings/pipeline.service.js');
    expect(typeof mod.embedWebsite).toBe('function');
  });

  test('exports embedPage', async () => {
    const mod = await import('../src/services/embeddings/pipeline.service.js');
    expect(typeof mod.embedPage).toBe('function');
  });

  test('exports searchSimilar', async () => {
    const mod = await import('../src/services/embeddings/pipeline.service.js');
    expect(typeof mod.searchSimilar).toBe('function');
  });

  test('exports removeWebsiteEmbeddings', async () => {
    const mod = await import('../src/services/embeddings/pipeline.service.js');
    expect(typeof mod.removeWebsiteEmbeddings).toBe('function');
  });
});
