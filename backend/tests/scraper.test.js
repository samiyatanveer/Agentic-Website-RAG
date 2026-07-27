/**
 * scraper.test.js
 * Unit tests for Phase 3 — Static Scraper.
 *
 * Tests extractor.service and cleaner.service without any network calls.
 * Uses inline HTML fixtures so tests are deterministic and offline.
 *
 * Skips network-dependent tests (fetcher, robots, crawler) to keep the
 * suite fast and reliable in CI.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

import { extractContent, extractInternalLinks, cleanText as extractorCleanText, normalizeWhitespace } from '../src/services/scraper/extractor.service.js';
import { cleanText, decodeEntities, filterBoilerplateLines, hasMinimumContent } from '../src/services/scraper/cleaner.service.js';
import { normalizeURL, generateContentHash } from '../src/utils/urlNormalizer.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const FULL_PAGE_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Article — My Site</title>
  <meta name="description" content="A test article about scraping.">
  <meta property="og:title" content="OG Title">
  <meta property="og:description" content="OG Description">
  <meta property="og:image" content="https://example.com/image.png">
  <meta name="author" content="Jane Doe">
  <meta name="keywords" content="scraping, testing, cheerio">
  <link rel="canonical" href="https://example.com/article">
  <style>body { color: red; }</style>
  <script>console.log("noise");</script>
</head>
<body>
  <header>
    <nav>
      <a href="/home">Home</a>
      <a href="/about">About</a>
    </nav>
  </header>
  <div class="cookie-banner">We use cookies. <button>Accept</button></div>
  <div class="ads"><script>adNetwork.load()</script>Buy stuff!</div>
  <aside class="sidebar">Related: <a href="/related">Related Article</a></aside>
  <main>
    <h1>Introduction to Web Scraping</h1>
    <p>Web scraping is the automated extraction of data from websites.</p>
    <h2>Why Scrape?</h2>
    <p>Scraping enables you to build datasets, monitor prices, and aggregate content.</p>
    <h3>Tools Used</h3>
    <ul>
      <li>Cheerio for static HTML</li>
      <li>Puppeteer for JavaScript-heavy pages</li>
    </ul>
    <a href="/page-2">Next Page</a>
    <a href="/page-3">Third Page</a>
    <a href="https://external.com/page">External Link</a>
    <a href="#section">Fragment anchor</a>
    <a href="mailto:test@example.com">Email</a>
  </main>
  <footer>
    <p>Privacy Policy | Terms of Service | &copy; 2024</p>
  </footer>
  <div id="comments">User comments go here.</div>
</body>
</html>
`;

const MINIMAL_HTML = `
<html><head><title>Min</title></head>
<body><main><p>Short content here for testing purposes only.</p></main></body>
</html>
`;

const BASE_URL = 'https://example.com/article';

// ─── extractor.service ────────────────────────────────────────────────────────

describe('extractor.service — extractContent()', () => {
  let result;

  beforeAll(() => {
    result = extractContent(FULL_PAGE_HTML, BASE_URL);
  });

  test('extracts page title from <title> tag', () => {
    expect(result.title).toBe('Test Article — My Site');
  });

  test('extracts meta description', () => {
    expect(result.description).toBe('A test article about scraping.');
  });

  test('extracts canonical URL', () => {
    expect(result.canonicalUrl).toBe('https://example.com/article');
  });

  test('extracts headings with correct levels', () => {
    expect(result.headings).toContainEqual({ level: 1, text: 'Introduction to Web Scraping' });
    expect(result.headings).toContainEqual({ level: 2, text: 'Why Scrape?' });
    expect(result.headings).toContainEqual({ level: 3, text: 'Tools Used' });
  });

  test('removes <script> tags from content', () => {
    expect(result.content).not.toContain('console.log');
    expect(result.content).not.toContain('adNetwork');
  });

  test('removes <style> tags from content', () => {
    expect(result.content).not.toContain('color: red');
  });

  test('removes cookie banner content', () => {
    expect(result.content).not.toContain('We use cookies');
  });

  test('removes sidebar content', () => {
    expect(result.content).not.toContain('Related Article');
  });

  test('removes navigation links', () => {
    // Nav text should be stripped
    expect(result.content).not.toContain('Home\nAbout');
  });

  test('removes footer content', () => {
    expect(result.content).not.toContain('Privacy Policy');
  });

  test('removes comment section', () => {
    expect(result.content).not.toContain('User comments go here');
  });

  test('preserves main body content', () => {
    expect(result.content).toContain('Web scraping is the automated extraction');
    expect(result.content).toContain('Cheerio for static HTML');
  });

  test('extracts metadata fields', () => {
    expect(result.metadata.ogTitle).toBe('OG Title');
    expect(result.metadata.ogImage).toBe('https://example.com/image.png');
    expect(result.metadata.author).toBe('Jane Doe');
    expect(result.metadata.keywords).toBe('scraping, testing, cheerio');
    expect(result.metadata.lang).toBe('en');
  });
});

// ─── extractor.service — link discovery ───────────────────────────────────────

describe('extractor.service — extractInternalLinks()', () => {
  let links;

  beforeAll(() => {
    const extracted = extractContent(FULL_PAGE_HTML, BASE_URL);
    links = extracted.links;
  });

  test('discovers internal links', () => {
    expect(links).toContain('https://example.com/page-2');
    expect(links).toContain('https://example.com/page-3');
  });

  test('excludes external links', () => {
    const external = links.filter(l => !l.startsWith('https://example.com'));
    expect(external).toHaveLength(0);
  });

  test('excludes fragment-only anchors', () => {
    expect(links).not.toContain('https://example.com/article#section');
  });

  test('excludes mailto: links', () => {
    expect(links.some(l => l.startsWith('mailto:'))).toBe(false);
  });

  test('returns deduplicated links', () => {
    // All links should be unique
    const unique = new Set(links);
    expect(unique.size).toBe(links.length);
  });
});

// ─── cleaner.service ──────────────────────────────────────────────────────────

describe('cleaner.service — cleanText()', () => {
  test('returns cleanedText, contentHash, and wordCount', () => {
    const input = 'This is a valid piece of content with enough words to pass the minimum length check imposed by the cleaner service.';
    const result = cleanText(input);
    expect(result.cleanedText).toBeDefined();
    expect(result.contentHash).toHaveLength(64);
    expect(result.wordCount).toBeGreaterThan(0);
  });

  test('throws E_EMPTY_CONTENT when content is too short', () => {
    expect(() => cleanText('Too short')).toThrow();
    expect(() => cleanText('Too short')).toThrowError(
      expect.objectContaining({ code: 'E_EMPTY_CONTENT' })
    );
  });

  test('throws E_EMPTY_CONTENT for null/undefined input', () => {
    expect(() => cleanText(null)).toThrow();
    expect(() => cleanText(undefined)).toThrow();
  });

  test('strips control characters', () => {
    const input = 'Valid content with a null byte \x00 and a bell \x07 character. '.repeat(5);
    const { cleanedText } = cleanText(input);
    expect(cleanedText).not.toContain('\x00');
    expect(cleanedText).not.toContain('\x07');
  });

  test('normalizes CRLF to LF', () => {
    const input = ('Line one\r\nLine two\r\nLine three. ').repeat(5);
    const { cleanedText } = cleanText(input);
    expect(cleanedText).not.toContain('\r');
  });

  test('same content produces identical hash', () => {
    const text = 'Consistent text for hashing that is definitely long enough to pass the minimum content length check used by the cleaner.';
    const h1 = cleanText(text).contentHash;
    const h2 = cleanText(text).contentHash;
    expect(h1).toBe(h2);
  });

  test('different content produces different hashes', () => {
    const base = 'Enough text to pass the minimum content length requirement for this test case, making it over one hundred characters.';
    const h1 = cleanText(base + ' version one').contentHash;
    const h2 = cleanText(base + ' version two').contentHash;
    expect(h1).not.toBe(h2);
  });
});

describe('cleaner.service — decodeEntities()', () => {
  test('decodes named HTML entities', () => {
    expect(decodeEntities('&amp; &lt; &gt; &quot;')).toBe('& < > "');
    expect(decodeEntities('&nbsp;')).toBe(' ');
    expect(decodeEntities('&mdash;')).toBe('—');
  });

  test('decodes numeric decimal entities', () => {
    expect(decodeEntities('&#169;')).toBe('©'); // copyright
    expect(decodeEntities('&#8364;')).toBe('€'); // euro
  });

  test('decodes numeric hex entities', () => {
    expect(decodeEntities('&#x00A9;')).toBe('©');
  });

  test('passes through normal text unchanged', () => {
    expect(decodeEntities('Hello World')).toBe('Hello World');
  });
});

describe('cleaner.service — filterBoilerplateLines()', () => {
  test('removes known boilerplate phrases', () => {
    const text = 'Good content here\nAll Rights Reserved\nMore good content\nRead More\nFinal content';
    const filtered = filterBoilerplateLines(text);
    expect(filtered).toContain('Good content here');
    expect(filtered).toContain('More good content');
    expect(filtered).not.toContain('All Rights Reserved');
    expect(filtered).not.toContain('Read More');
  });

  test('removes privacy policy and terms lines', () => {
    const text = 'Real content\nPrivacy Policy\nTerms of Service\nCookie Policy';
    const filtered = filterBoilerplateLines(text);
    expect(filtered).toContain('Real content');
    expect(filtered).not.toContain('Privacy Policy');
    expect(filtered).not.toContain('Terms of Service');
    expect(filtered).not.toContain('Cookie Policy');
  });

  test('keeps non-boilerplate lines intact', () => {
    const text = 'This is a substantive paragraph about scraping techniques.';
    expect(filterBoilerplateLines(text)).toContain(text.trim());
  });
});

describe('cleaner.service — hasMinimumContent()', () => {
  test('returns true for content over threshold', () => {
    const long = 'a'.repeat(200);
    expect(hasMinimumContent(long)).toBe(true);
  });

  test('returns false for short content', () => {
    expect(hasMinimumContent('Short')).toBe(false);
  });

  test('returns false for null/undefined', () => {
    expect(hasMinimumContent(null)).toBe(false);
    expect(hasMinimumContent(undefined)).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(hasMinimumContent('')).toBe(false);
  });
});

// ─── urlNormalizer (regression) ───────────────────────────────────────────────

describe('urlNormalizer — normalizeURL()', () => {
  test('lowercases hostname', () => {
    expect(normalizeURL('https://EXAMPLE.COM/page')).toBe('https://example.com/page');
  });

  test('removes trailing slash from non-root paths', () => {
    expect(normalizeURL('https://example.com/about/')).toBe('https://example.com/about');
  });

  test('removes URL fragment', () => {
    expect(normalizeURL('https://example.com/page#section')).toBe('https://example.com/page');
  });

  test('removes default HTTPS port', () => {
    expect(normalizeURL('https://example.com:443/page')).toBe('https://example.com/page');
  });

  test('sorts query parameters alphabetically', () => {
    const url = normalizeURL('https://example.com/?z=3&a=1&m=2');
    const params = new URL(url).searchParams;
    const keys = [...params.keys()];
    expect(keys).toEqual([...keys].sort());
  });

  test('throws on invalid URL', () => {
    expect(() => normalizeURL('not-a-url')).toThrow();
  });
});

describe('urlNormalizer — generateContentHash()', () => {
  test('produces 64-char hex hash', () => {
    const hash = generateContentHash('hello world');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
  });

  test('same input → same hash', () => {
    expect(generateContentHash('abc')).toBe(generateContentHash('abc'));
  });

  test('different input → different hash', () => {
    expect(generateContentHash('abc')).not.toBe(generateContentHash('xyz'));
  });
});
