/**
 * extractContent.tool.js
 * Agent tool: Cheerio-based content extraction from raw HTML.
 *
 * Wraps extractor.service.extractContent + cleaner.service.cleanText.
 * Produces the final structured content object ready for DB persistence.
 */

import { extractContent } from '../../scraper/extractor.service.js';
import { cleanText, hasMinimumContent } from '../../scraper/cleaner.service.js';
import { ERROR_CODES } from '../../../config/constants.js';

/**
 * Extract and clean content from raw HTML.
 *
 * @param {string} html - Raw HTML string
 * @param {string} url  - Page URL (for link resolution and error messages)
 * @returns {Promise<ToolResult>}
 */
export async function run(html, url) {
  try {
    // 1. Extract structured content from HTML
    const extracted = extractContent(html, url);

    // 2. Check if there's enough content before cleaning
    if (!hasMinimumContent(extracted.content)) {
      return {
        success: false,
        toolName: 'extractContent',
        data: null,
        error: 'Insufficient content extracted from page',
        errorCode: ERROR_CODES.EMPTY_CONTENT,
      };
    }

    // 3. Clean and hash the body text
    const { cleanedText, contentHash, wordCount } = cleanText(extracted.content, url);

    return {
      success: true,
      toolName: 'extractContent',
      data: {
        title:        extracted.title,
        description:  extracted.description,
        canonicalUrl: extracted.canonicalUrl,
        headings:     extracted.headings,
        content:      cleanedText,
        contentHash,
        wordCount,
        links:        extracted.links,
        metadata:     extracted.metadata,
      },
    };
  } catch (err) {
    return {
      success: false,
      toolName: 'extractContent',
      data: null,
      error: err.message,
      errorCode: err.code || ERROR_CODES.EMPTY_CONTENT,
    };
  }
}

export const meta = {
  name: 'extractContent',
  description: 'Extracts structured content (title, headings, body text, links, metadata) from raw HTML using Cheerio. Includes content cleaning and hashing.',
  inputSchema: { html: 'string', url: 'string' },
  recommendedFor: 'All pages after HTML is available (static or dynamic)',
};
