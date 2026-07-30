/**
 * extractor.service.js
 * Cheerio-based HTML parser and content extractor.
 *
 * SRP: Transforms raw HTML into structured content + links.
 *      No HTTP requests, no DB access, no robots.txt logic.
 *
 * Produces:
 *   { title, description, headings, content, links, metadata }
 */

import * as cheerio from 'cheerio';
import { normalizeURL } from '../../utils/urlNormalizer.js';
import logger from '../../utils/logger.js';

// ─── Elements to remove before extraction ─────────────────────────────────────

/**
 * Selectors for noise content that should be stripped before text extraction.
 * Ordered from most-specific (cookie banners, ads) to least (generic nav).
 */
const NOISE_SELECTORS = [
  // Scripts and styles
  'script', 'style', 'noscript',

  // Tracking and analytics
  'iframe[src*="google"]', 'iframe[src*="facebook"]', 'iframe[src*="twitter"]',
  '[class*="analytics"]', '[id*="analytics"]',
  '[class*="tracking"]', '[id*="tracking"]',
  '[class*="pixel"]',

  // Cookie banners and GDPR notices
  '[class*="cookie"]', '[id*="cookie"]',
  '[class*="gdpr"]', '[id*="gdpr"]',
  '[class*="consent"]', '[id*="consent"]',
  // Generic "banner" often contains a site's hero and primary copy. Keep it;
  // the cookie/consent selectors above remove actual consent UI.
  '[aria-label*="cookie" i]',

  // Advertisements
  '[class*="advert"]', '[id*="advert"]',
  '[class*=" ad-"]', '[class*="-ad "]',
  '[class*="sponsored"]', '[id*="sponsored"]',
  '[data-ad]', '[data-adunit]',
  '.ad', '#ad', '.ads', '#ads',

  // Navigation
  'nav', 'header nav', '[role="navigation"]',
  '[class*="navbar"]', '[id*="navbar"]',
  '[class*="menu"]', '[id*="sidemenu"]',
  '[class*="breadcrumb"]', '[id*="breadcrumb"]',

  // Sidebars and widgets
  'aside', '[role="complementary"]',
  '[class*="sidebar"]', '[id*="sidebar"]',
  '[class*="widget"]',

  // Headers and footers (page chrome)
  'header', 'footer',
  '[class*="site-header"]', '[class*="site-footer"]',
  '[class*="page-header"]', '[class*="page-footer"]',

  // Social sharing buttons
  '[class*="social"]', '[class*="share"]',
  '[class*="share-button"]', '[class*="social-links"]',

  // Comments sections
  '[id*="comments"]', '[class*="comments"]',
  '#disqus_thread', '.disqus',

  // Popups and modals
  '[class*="modal"]', '[class*="popup"]', '[class*="overlay"]',
  '[role="dialog"]',

  // Skip links and accessibility helpers
  '[class*="skip"]', '[class*="sr-only"]',
  '[class*="screen-reader"]', '[class*="visually-hidden"]',

  // Print and hidden elements
  '[class*="print-only"]', '[hidden]',
  '[aria-hidden="true"]',

  // Misc boilerplate
  '[class*="related"]', '[class*="recommended"]',
  '[class*="newsletter"]', '[id*="newsletter"]',
  'form[class*="search"]', '[class*="pagination"]',
];

// ─── Main extraction function ─────────────────────────────────────────────────

/**
 * Extract structured content from raw HTML.
 *
 * @param {string} html - Raw HTML string from fetcher
 * @param {string} pageUrl - URL of the page (used for link resolution)
 * @returns {{
 *   title: string,
 *   description: string,
 *   canonicalUrl: string|null,
 *   headings: { level: number, text: string }[],
 *   content: string,
 *   links: string[],
 *   metadata: { ogTitle?, ogDescription?, ogImage?, author?, keywords?, lang? }
 * }}
 */
export function extractContent(html, pageUrl) {
  let $;
  try {
    $ = cheerio.load(html, { decodeEntities: true });
  } catch (err) {
    logger.warn(`Cheerio failed to parse ${pageUrl}: ${err.message}`);
    return emptyResult(pageUrl);
  }

  // ── 1. Remove all noise elements ──────────────────────────────────────────
  for (const selector of NOISE_SELECTORS) {
    try { $(selector).remove(); } catch { /* ignore invalid selectors */ }
  }

  // ── 2. Extract metadata BEFORE stripping more elements ────────────────────
  const title = extractTitle($);
  const description = extractDescription($);
  const canonicalUrl = extractCanonical($, pageUrl);
  const metadata = extractMetadata($);
  const headings = extractHeadings($);

  // ── 3. Discover internal links BEFORE stripping anchors ───────────────────
  const links = extractInternalLinks($, pageUrl);

  // ── 4. Extract main body text ─────────────────────────────────────────────
  const content = extractBodyText($);

  return { title, description, canonicalUrl, headings, content, links, metadata };
}

// ─── Extraction helpers ───────────────────────────────────────────────────────

function extractTitle($) {
  // Priority: <title> > og:title > first h1
  const titleTag = $('title').first().text().trim();
  if (titleTag) return cleanText(titleTag);

  const ogTitle = $('meta[property="og:title"]').attr('content');
  if (ogTitle) return cleanText(ogTitle);

  const h1 = $('h1').first().text().trim();
  return h1 ? cleanText(h1) : '';
}

function extractDescription($) {
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) return cleanText(metaDesc);

  const ogDesc = $('meta[property="og:description"]').attr('content');
  if (ogDesc) return cleanText(ogDesc);

  // Fall back to first substantial paragraph
  let firstPara = '';
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (!firstPara && text.length > 80) {
      firstPara = text;
    }
  });
  return cleanText(firstPara);
}

function extractCanonical($, pageUrl) {
  const canonical = $('link[rel="canonical"]').attr('href');
  if (!canonical) return null;
  try {
    return normalizeURL(new URL(canonical, pageUrl).href);
  } catch {
    return null;
  }
}

function extractMetadata($) {
  return {
    ogTitle:       $('meta[property="og:title"]').attr('content')       || null,
    ogDescription: $('meta[property="og:description"]').attr('content') || null,
    ogImage:       $('meta[property="og:image"]').attr('content')        || null,
    author:        $('meta[name="author"]').attr('content')              || null,
    keywords:      $('meta[name="keywords"]').attr('content')            || null,
    lang:          $('html').attr('lang')                                || null,
  };
}

function extractHeadings($) {
  const headings = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      headings.push({
        level: parseInt(el.tagName.replace('h', ''), 10),
        text: cleanText(text),
      });
    }
  });
  return headings;
}

/**
 * Discover internal links on the page.
 * Only returns links on the same origin (no external links, no anchors).
 *
 * @param {CheerioAPI} $
 * @param {string} pageUrl
 * @returns {string[]} Deduplicated, normalized URLs
 */
export function extractInternalLinks($, pageUrl) {
  let origin;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  const seen = new Set();
  const links = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;

    // Skip anchors, mailto, tel, javascript:, data:
    if (href.startsWith('#') || href.startsWith('mailto:') ||
        href.startsWith('tel:')  || href.startsWith('javascript:') ||
        href.startsWith('data:')) return;

    let absolute;
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      return; // Malformed href
    }

    // Must be same origin
    if (!absolute.startsWith(origin)) return;

    // Normalize and deduplicate
    let normalized;
    try {
      normalized = normalizeURL(absolute);
    } catch {
      return;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      links.push(normalized);
    }
  });

  return links;
}

/**
 * Extract plain text from the remaining (cleaned) body.
 * Uses cheerio's built-in .text() on the best container element,
 * then normalizes whitespace to produce readable plain text.
 *
 * @param {CheerioAPI} $
 * @returns {string}
 */
function extractBodyText($) {
  // Priority: <main> > <article> > [role=main] > <body>
  const container =
    $('main').length          ? $('main') :
    $('article').length       ? $('article') :
    $('[role="main"]').length  ? $('[role="main"]') :
    $('body');

  if (!container.length) return '';

  // Add newlines after block-level elements so words don't run together
  // We do this by replacing block elements' text with text + newline
  const blockTags = 'p, h1, h2, h3, h4, h5, h6, li, tr, div, section, article, blockquote, pre, br';
  container.find(blockTags).each((_, el) => {
    $(el).append('\n');
  });

  const raw = container.text();
  return normalizeWhitespace(raw);
}

// ─── Text utilities ───────────────────────────────────────────────────────────

/**
 * Remove excess whitespace from a single-line string.
 * @param {string} text
 * @returns {string}
 */
export function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize multi-line extracted body text.
 * Collapses multiple blank lines, trims each line.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeWhitespace(text) {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean) // Remove empty lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
    .trim();
}

/**
 * Returns an empty extraction result for error cases.
 * @param {string} pageUrl
 */
function emptyResult(pageUrl) {
  return {
    title: '',
    description: '',
    canonicalUrl: null,
    headings: [],
    content: '',
    links: [],
    metadata: {},
  };
}
