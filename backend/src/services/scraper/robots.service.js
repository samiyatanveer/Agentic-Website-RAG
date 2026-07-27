/**
 * robots.service.js
 * Fetches and parses robots.txt for a given domain.
 *
 * SRP: Only knows about robots.txt — nothing about pages, HTML, or the DB.
 *
 * Uses the `robots-parser` package for RFC-compliant parsing.
 */

import axios from 'axios';
import robotsParser from 'robots-parser';
import { normalizeURL } from '../../utils/urlNormalizer.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';

// Per-domain cache so we only fetch robots.txt once per domain per process
const cache = new Map(); // hostname → { robots, crawlDelayMs, fetchedAt }

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Fetch and parse robots.txt for the domain of the given URL.
 * Results are cached per-domain.
 *
 * @param {string} pageUrl - Any URL on the target domain
 * @returns {Promise<{ robots: object, crawlDelayMs: number }>}
 */
async function getRobotsForDomain(pageUrl) {
  const parsed = new URL(pageUrl);
  const hostname = parsed.hostname;
  const robotsUrl = `${parsed.protocol}//${parsed.host}/robots.txt`;

  // Return cached entry if still fresh
  const cached = cache.get(hostname);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  let robotsTxt = '';
  try {
    const res = await axios.get(robotsUrl, {
      timeout: 5000,
      headers: { 'User-Agent': env.SCRAPER_USER_AGENT },
      validateStatus: () => true, // Don't throw on 404
    });
    if (res.status === 200 && typeof res.data === 'string') {
      robotsTxt = res.data;
    }
    // 404 or other → empty robotsTxt → everything allowed
  } catch (err) {
    logger.warn(`robots.txt fetch failed for ${hostname}: ${err.message}`);
    // Network error → assume allowed (fail-open)
  }

  const robots = robotsParser(robotsUrl, robotsTxt);

  // Extract Crawl-delay for our user-agent (seconds → ms)
  let crawlDelayMs = env.SCRAPER_REQUEST_DELAY_MS;
  try {
    const declared = robots.getCrawlDelay(env.SCRAPER_USER_AGENT);
    if (declared && typeof declared === 'number') {
      crawlDelayMs = Math.max(crawlDelayMs, declared * 1000);
    }
  } catch {
    // Not all parsers expose getCrawlDelay; swallow silently
  }

  const entry = { robots, crawlDelayMs, fetchedAt: Date.now() };
  cache.set(hostname, entry);
  return entry;
}

/**
 * Check whether our bot is allowed to fetch the given URL according to robots.txt.
 * Returns true (allowed) if robots.txt is missing or network error occurs (fail-open).
 *
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function isAllowed(url) {
  if (!env.SCRAPER_RESPECT_ROBOTS_TXT) return true;
  try {
    const normalizedUrl = normalizeURL(url);
    const { robots } = await getRobotsForDomain(normalizedUrl);
    return robots.isAllowed(normalizedUrl, env.SCRAPER_USER_AGENT) !== false;
  } catch (err) {
    logger.warn(`robots.txt allowed-check error for ${url}: ${err.message}`);
    return true; // Fail open
  }
}

/**
 * Get the effective crawl delay (ms) for the domain of a given URL.
 * Returns the config default if robots.txt doesn't specify one.
 *
 * @param {string} url
 * @returns {Promise<number>} Milliseconds to wait between requests
 */
export async function getCrawlDelay(url) {
  try {
    const { crawlDelayMs } = await getRobotsForDomain(url);
    return crawlDelayMs;
  } catch {
    return env.SCRAPER_REQUEST_DELAY_MS;
  }
}

/**
 * Clear the in-memory robots.txt cache.
 * Useful in tests to ensure isolation.
 */
export function clearCache() {
  cache.clear();
}
