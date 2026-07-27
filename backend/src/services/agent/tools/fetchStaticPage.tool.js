/**
 * fetchStaticPage.tool.js
 * Agent tool: static HTTP page fetch via axios.
 *
 * Wraps fetcher.service.fetchPage. Returns raw HTML + metadata.
 * The agent uses this for standard static HTML sites.
 */

import { fetchPage, looksJavaScriptHeavy } from '../../scraper/fetcher.service.js';

/**
 * Fetch a static HTML page.
 *
 * @param {string} url
 * @param {{ timeout?: number }} opts
 * @returns {Promise<ToolResult>}
 */
export async function run(url, opts = {}) {
  try {
    const result = await fetchPage(url, opts);
    const isJsHeavy = looksJavaScriptHeavy(result.html);

    return {
      success: true,
      toolName: 'fetchStaticPage',
      data: {
        ...result,
        isJsHeavy,
        byteLength: result.html.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'fetchStaticPage',
      data: null,
      error: err.message,
      errorCode: err.code,
    };
  }
}

export const meta = {
  name: 'fetchStaticPage',
  description: 'Fetches a static HTML page via HTTP GET. Returns html, statusCode, finalUrl, responseTimeMs, and isJsHeavy heuristic.',
  inputSchema: { url: 'string', timeout: 'number?' },
  recommendedFor: 'Standard static HTML pages',
};
