/**
 * sitemap.tool.js
 * Agent tool: sitemap.xml discovery and parsing.
 *
 * Tries common sitemap locations, parses the XML, and returns
 * a deduplicated list of URLs for the agent to enqueue.
 *
 * Handles:
 *  - /sitemap.xml
 *  - /sitemap_index.xml
 *  - Sitemap: header in robots.txt
 *  - Nested sitemap indexes (one level deep)
 */

import axios from 'axios';
import env from '../../../config/env.js';
import { normalizeURL } from '../../../utils/urlNormalizer.js';
import logger from '../../../utils/logger.js';

const COMMON_SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-index.xml',
  '/sitemap/sitemap.xml',
  '/sitemap/index.xml',
];

const FETCH_OPTS = {
  timeout: 10000,
  headers: { 'User-Agent': env.SCRAPER_USER_AGENT },
  validateStatus: () => true,
};

/**
 * Discover and parse sitemaps for a given site.
 *
 * @param {string} siteUrl - Root URL of the site (https://example.com or any page URL)
 * @returns {Promise<ToolResult>}
 */
export async function run(siteUrl) {
  try {
    const origin = new URL(siteUrl).origin;
    const urls = new Set();

    // Try each common path
    for (const path of COMMON_SITEMAP_PATHS) {
      const sitemapUrl = `${origin}${path}`;
      const sitemapUrls = await fetchAndParseSitemap(sitemapUrl, origin);
      sitemapUrls.forEach((u) => urls.add(u));
      if (urls.size > 0) break; // Stop on first successful sitemap
    }

    // Also check robots.txt for Sitemap: directive
    const robotsSitemapUrls = await getSitemapFromRobots(origin);
    for (const su of robotsSitemapUrls) {
      const sitemapUrls = await fetchAndParseSitemap(su, origin);
      sitemapUrls.forEach((u) => urls.add(u));
    }

    const urlList = [...urls].slice(0, 1000); // Cap at 1000

    return {
      success: true,
      toolName: 'sitemap',
      data: {
        siteUrl: origin,
        urls: urlList,
        count: urlList.length,
        found: urlList.length > 0,
      },
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'sitemap',
      data: { urls: [], count: 0, found: false },
      error: err.message,
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function fetchAndParseSitemap(sitemapUrl, origin) {
  try {
    const res = await axios.get(sitemapUrl, FETCH_OPTS);
    if (res.status !== 200 || !res.data) return [];

    const xml = typeof res.data === 'string' ? res.data : String(res.data);

    // Check if this is a sitemap index
    if (xml.includes('<sitemapindex')) {
      return parseSitemapIndex(xml, origin);
    }

    return parseUrlSet(xml, origin);
  } catch {
    return [];
  }
}

/**
 * Parse <urlset> — returns list of <loc> URLs on the same origin.
 */
function parseUrlSet(xml, origin) {
  const urls = [];
  const locRegex = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    const rawUrl = match[1].trim();
    try {
      const normalized = normalizeURL(rawUrl);
      if (normalized.startsWith(origin)) {
        urls.push(normalized);
      }
    } catch { /* skip malformed */ }
  }
  return urls;
}

/**
 * Parse <sitemapindex> — fetches each child sitemap (one level only).
 */
async function parseSitemapIndex(xml, origin) {
  const childUrls = [];
  const locRegex = /<loc>\s*([^<]+)\s*<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xml)) !== null) {
    childUrls.push(match[1].trim());
  }

  const allPageUrls = [];
  for (const childUrl of childUrls.slice(0, 10)) { // Max 10 child sitemaps
    const pageUrls = await fetchAndParseSitemap(childUrl, origin);
    allPageUrls.push(...pageUrls);
  }
  return allPageUrls;
}

/**
 * Extract Sitemap: directives from robots.txt.
 */
async function getSitemapFromRobots(origin) {
  try {
    const res = await axios.get(`${origin}/robots.txt`, { ...FETCH_OPTS, timeout: 5000 });
    if (res.status !== 200 || !res.data) return [];

    const sitemapUrls = [];
    const lines = String(res.data).split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('sitemap:')) {
        const url = trimmed.substring(8).trim();
        if (url.startsWith('http')) sitemapUrls.push(url);
      }
    }
    return sitemapUrls;
  } catch {
    return [];
  }
}

export const meta = {
  name: 'sitemap',
  description: 'Discovers sitemap.xml, parses it, and returns all page URLs. Handles sitemap indexes (one level deep) and robots.txt Sitemap: directives.',
  inputSchema: { siteUrl: 'string' },
  recommendedFor: 'Sites where comprehensive URL discovery is needed before crawling',
};
