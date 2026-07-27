/**
 * duplicateCheck.tool.js
 * Agent tool: duplicate detection for both websites and pages.
 *
 * Wraps website.service.checkDuplicateWebsite and
 * page.service.hasContentChanged.
 */

import * as websiteService from '../../database/website.service.js';
import * as pageService from '../../database/page.service.js';

/**
 * Check whether a website has already been scraped (URL-level duplicate).
 *
 * @param {string} url
 * @returns {Promise<ToolResult>}
 */
export async function checkWebsiteDuplicate(url) {
  try {
    const result = await websiteService.checkDuplicateWebsite(url);
    return {
      success: true,
      toolName: 'duplicateCheck.website',
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'duplicateCheck.website',
      data: { isDuplicate: false },
      error: err.message,
    };
  }
}

/**
 * Check whether a page's content has changed since last scrape.
 *
 * @param {string} url
 * @param {string} websiteId
 * @param {string} newContent - Freshly extracted content
 * @returns {Promise<ToolResult>}
 */
export async function checkPageChanged(url, websiteId, newContent) {
  try {
    const result = await pageService.hasContentChanged(url, websiteId, newContent);
    return {
      success: true,
      toolName: 'duplicateCheck.page',
      data: result,
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'duplicateCheck.page',
      data: { changed: true }, // Assume changed on error
      error: err.message,
    };
  }
}

export const meta = {
  name: 'duplicateCheck',
  description: 'Detects duplicate websites (URL hash) and unchanged pages (content hash).',
  inputSchema: { url: 'string', websiteId: 'string?', newContent: 'string?' },
};
