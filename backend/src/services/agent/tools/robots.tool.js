/**
 * robots.tool.js
 * Agent tool: robots.txt checking.
 *
 * Wraps robots.service.js — the agent calls this tool to determine
 * whether a URL is allowed before scraping it.
 *
 * Returns a structured ToolResult for the agent to act on.
 */

import { isAllowed, getCrawlDelay } from '../../scraper/robots.service.js';

/**
 * @typedef {Object} ToolResult
 * @property {boolean} success
 * @property {string}  toolName
 * @property {any}     data
 * @property {string}  [error]
 */

/**
 * Check robots.txt for a given URL.
 *
 * @param {string} url
 * @returns {Promise<ToolResult>}
 */
export async function run(url) {
  try {
    const allowed = await isAllowed(url);
    const crawlDelayMs = await getCrawlDelay(url);

    return {
      success: true,
      toolName: 'robots',
      data: {
        url,
        allowed,
        crawlDelayMs,
        reason: allowed ? 'URL is permitted by robots.txt' : 'URL is blocked by robots.txt',
      },
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'robots',
      data: { url, allowed: true }, // Fail-open
      error: err.message,
    };
  }
}

export const meta = {
  name: 'robots',
  description: 'Checks robots.txt to determine if a URL may be scraped.',
  inputSchema: { url: 'string' },
};
