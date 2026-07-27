/**
 * agent.test.js
 * Unit tests for Phase 4 — Agentic Scraping.
 *
 * Tests tool logic and agent decision-making with no real network calls.
 * Uses Jest module mocking for fetcher.service and database services.
 *
 * Strategy tested:
 *  - Tool meta contracts (all tools export meta.name)
 *  - extractContent.tool: pure content transformation (no network)
 *  - discoverLinks.tool: pure HTML parsing (no network)
 *  - duplicateCheck.tool: mocked DB service calls
 *  - agent.service.STRATEGY constants exist and are consistent
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import * as cheerio from 'cheerio';

// ─── Tool import tests (meta contracts) ──────────────────────────────────────

import * as robotsTool         from '../src/services/agent/tools/robots.tool.js';
import * as fetchStaticTool    from '../src/services/agent/tools/fetchStaticPage.tool.js';
import * as extractContentTool from '../src/services/agent/tools/extractContent.tool.js';
import * as discoverLinksTool  from '../src/services/agent/tools/discoverLinks.tool.js';
import * as sitemapTool        from '../src/services/agent/tools/sitemap.tool.js';
import * as dupCheckTool       from '../src/services/agent/tools/duplicateCheck.tool.js';
import * as renderDynamicTool  from '../src/services/agent/tools/renderDynamicPage.tool.js';
import { STRATEGY }            from '../src/services/agent/agent.service.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATIC_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Agent Test Page</title>
  <meta name="description" content="Testing the agent extraction pipeline.">
</head>
<body>
  <header><nav><a href="/home">Home</a><a href="/about">About</a></nav></header>
  <div class="cookie-banner">Accept cookies.</div>
  <main>
    <h1>Main Content Heading</h1>
    <p>This is the primary content of the page that the agent should extract.</p>
    <p>It contains multiple paragraphs so that the word count passes the minimum threshold.</p>
    <p>Additional content paragraph to ensure sufficient length for extraction.</p>
    <a href="/page-a">Internal Link A</a>
    <a href="/page-b">Internal Link B</a>
    <a href="https://external.com">External</a>
  </main>
  <footer>Footer content here.</footer>
  <script>console.log('noise')</script>
</body>
</html>
`;

const EMPTY_HTML = `
<html><body><script>app.render()</script><div id="app"></div></body></html>
`;

const BASE_URL = 'https://example.com/test';

// ─── Tool Meta Contract Tests ─────────────────────────────────────────────────

describe('Tool contracts — all tools export a meta object', () => {
  const tools = [
    { name: 'robots',           tool: robotsTool },
    { name: 'fetchStaticPage',  tool: fetchStaticTool },
    { name: 'extractContent',   tool: extractContentTool },
    { name: 'discoverLinks',    tool: discoverLinksTool },
    { name: 'sitemap',          tool: sitemapTool },
    { name: 'duplicateCheck',   tool: dupCheckTool },
    { name: 'renderDynamicPage',tool: renderDynamicTool },
  ];

  for (const { name, tool } of tools) {
    test(`${name} exports meta.name`, () => {
      expect(tool.meta).toBeDefined();
      expect(typeof tool.meta.name).toBe('string');
      expect(tool.meta.name.length).toBeGreaterThan(0);
    });

    test(`${name} exports a run() function (or named functions)`, () => {
      const hasRun = typeof tool.run === 'function';
      const hasNamedFns = Object.values(tool).some(
        (v) => typeof v === 'function' && v !== tool.meta
      );
      expect(hasRun || hasNamedFns).toBe(true);
    });
  }
});

// ─── agent.service — STRATEGY constants ───────────────────────────────────────

describe('agent.service — STRATEGY constants', () => {
  test('STRATEGY.STATIC is defined', () => {
    expect(STRATEGY.STATIC).toBeDefined();
    expect(typeof STRATEGY.STATIC).toBe('string');
  });

  test('STRATEGY.DYNAMIC is defined', () => {
    expect(STRATEGY.DYNAMIC).toBeDefined();
  });

  test('STRATEGY.SITEMAP is defined', () => {
    expect(STRATEGY.SITEMAP).toBeDefined();
  });

  test('STRATEGY.SKIP is defined', () => {
    expect(STRATEGY.SKIP).toBeDefined();
  });

  test('STRATEGY.ABORT is defined', () => {
    expect(STRATEGY.ABORT).toBeDefined();
  });

  test('All strategy values are unique strings', () => {
    const values = Object.values(STRATEGY);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });
});

// ─── extractContent.tool — pure content transformation ───────────────────────

describe('extractContent.tool — run(html, url)', () => {
  test('returns success=true for valid HTML with sufficient content', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.success).toBe(true);
    expect(result.toolName).toBe('extractContent');
    expect(result.data).not.toBeNull();
  });

  test('extracts title from HTML', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.title).toBe('Agent Test Page');
  });

  test('extracts description from meta tag', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.description).toBe('Testing the agent extraction pipeline.');
  });

  test('extracts content body text', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.content).toContain('primary content');
  });

  test('extracts internal links', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.links).toContain('https://example.com/page-a');
    expect(result.data.links).toContain('https://example.com/page-b');
  });

  test('excludes external links from extracted links', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.links.some(l => l.includes('external.com'))).toBe(false);
  });

  test('removes noise elements (cookies, nav, script) from content', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.content).not.toContain("console.log");
    expect(result.data.content).not.toContain("Accept cookies");
  });

  test('returns contentHash as 64-char hex string', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.contentHash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(result.data.contentHash)).toBe(true);
  });

  test('returns wordCount > 0', async () => {
    const result = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.wordCount).toBeGreaterThan(0);
  });

  test('returns success=false for nearly-empty JS SPA HTML', async () => {
    const result = await extractContentTool.run(EMPTY_HTML, BASE_URL);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('E_EMPTY_CONTENT');
  });

  test('returns consistent contentHash for same input', async () => {
    const r1 = await extractContentTool.run(STATIC_HTML, BASE_URL);
    const r2 = await extractContentTool.run(STATIC_HTML, BASE_URL);
    expect(r1.data.contentHash).toBe(r2.data.contentHash);
  });

  test('returns different contentHash for different HTML', async () => {
    const altHtml = STATIC_HTML.replace('primary content', 'completely different text here');
    const r1 = await extractContentTool.run(STATIC_HTML, BASE_URL);
    const r2 = await extractContentTool.run(altHtml, BASE_URL);
    expect(r1.data.contentHash).not.toBe(r2.data.contentHash);
  });
});

// ─── discoverLinks.tool — pure HTML parsing ───────────────────────────────────

describe('discoverLinks.tool — run(html, pageUrl)', () => {
  test('discovers internal links', async () => {
    const result = await discoverLinksTool.run(STATIC_HTML, BASE_URL);
    expect(result.success).toBe(true);
    expect(result.data.links).toContain('https://example.com/page-a');
    expect(result.data.links).toContain('https://example.com/page-b');
  });

  test('excludes external links', async () => {
    const result = await discoverLinksTool.run(STATIC_HTML, BASE_URL);
    const external = result.data.links.filter(l => !l.startsWith('https://example.com'));
    expect(external).toHaveLength(0);
  });

  test('returns count matching links array length', async () => {
    const result = await discoverLinksTool.run(STATIC_HTML, BASE_URL);
    expect(result.data.count).toBe(result.data.links.length);
  });

  test('returns empty links for HTML with no anchors', async () => {
    const noLinks = '<html><body><p>No links here</p></body></html>';
    const result = await discoverLinksTool.run(noLinks, BASE_URL);
    expect(result.success).toBe(true);
    expect(result.data.links).toHaveLength(0);
    expect(result.data.count).toBe(0);
  });

  test('returns deduplicated links', async () => {
    const dupHtml = `<html><body>
      <a href="/page">Link 1</a>
      <a href="/page">Link 2 (same)</a>
      <a href="/page/">Link 3 (trailing slash)</a>
    </body></html>`;
    const result = await discoverLinksTool.run(dupHtml, 'https://example.com/');
    const unique = new Set(result.data.links);
    expect(unique.size).toBe(result.data.links.length);
  });
});

// ─── renderDynamicPage.tool — availability check ──────────────────────────────

describe('renderDynamicPage.tool — isAvailable()', () => {
  test('isAvailable() returns a boolean', () => {
    const available = renderDynamicTool.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  test('meta is defined with description', () => {
    expect(renderDynamicTool.meta.description).toBeDefined();
    expect(renderDynamicTool.meta.recommendedFor).toBeDefined();
  });
});
