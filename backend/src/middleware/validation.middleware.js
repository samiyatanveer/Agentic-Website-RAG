/**
 * validation.middleware.js
 * Request body validation middleware for key endpoints.
 * Returns 400 immediately if required fields are missing or malformed.
 */

import { validateURL, validateMessage, validateId } from '../utils/validators.js';
import { ERROR_CODES } from '../config/constants.js';

/**
 * Validate POST /api/scrape requests.
 * Requires: body.url (valid HTTP/HTTPS URL)
 */
export function validateScrapeRequest(req, res, next) {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_URL,
        message: 'URL is required in the request body',
        statusCode: 400,
        userMessage: 'Please provide a website URL to scrape.',
      },
    });
  }

  if (!validateURL(url)) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_URL,
        message: `Invalid URL format: "${url}"`,
        statusCode: 400,
        userMessage: 'Please enter a valid URL starting with http:// or https://',
      },
    });
  }

  next();
}

/**
 * Validate POST /api/chat requests.
 * Requires: body.websiteId, body.message
 */
export function validateChatRequest(req, res, next) {
  const { websiteId, message } = req.body;

  if (!websiteId || !validateId(websiteId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_INPUT,
        message: 'websiteId is required',
        statusCode: 400,
        userMessage: 'Please select a website knowledge base before chatting.',
      },
    });
  }

  if (!message || !validateMessage(message)) {
    return res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.INVALID_INPUT,
        message: 'message is required and must be 1–5000 characters',
        statusCode: 400,
        userMessage: 'Please enter a message (1–5000 characters).',
      },
    });
  }

  next();
}
