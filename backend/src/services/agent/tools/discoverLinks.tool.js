/**
 * discoverLinks.tool.js
 * Agent tool: internal link discovery from an already-fetched HTML page.
 *
 * Wraps extractor.service.extractInternalLinks.
 * Filters to same-origin links and deduplicates them.
 */

import * as cheerio from 'cheerio';
import { extractInternalLinks } from '../../scraper/extractor.service.js';

/**
 * Discover internal links from raw HTML.
 *
 * @param {string} html    - Raw HTML to parse
 * @param {string} pageUrl - Base URL for link resolution and origin filtering
 * @returns {Promise<ToolResult>}
 */
export async function run(html, pageUrl) {
  try {
    const $ = cheerio.load(html, { decodeEntities: true });
    const links = extractInternalLinks($, pageUrl);

    return {
      success: true,
      toolName: 'discoverLinks',
      data: {
        pageUrl,
        links,
        count: links.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'discoverLinks',
      data: { links: [], count: 0 },
      error: err.message,
    };
  }
}

export const meta = {
  name: 'discoverLinks',
  description: 'Discovers all internal (same-origin) links from a page\'s HTML. Returns deduplicated, normalized URLs.',
  inputSchema: { html: 'string', pageUrl: 'string' },
};
