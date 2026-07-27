/**
 * renderDynamicPage.tool.js
 * Agent tool: JavaScript-rendered page via Puppeteer (headless Chrome).
 *
 * Used when fetchStaticPage returns isJsHeavy=true or content is insufficient.
 * Requires Google Chrome or Chromium to be installed on the system.
 *
 * Gracefully degrades: if Puppeteer/Chrome is unavailable, returns an error
 * so the agent can fall back to static fetching.
 */

import env from '../../../config/env.js';
import logger from '../../../utils/logger.js';
import { existsSync } from 'fs';

// Puppeteer is an optional dependency. If not installed or Chrome not found,
// this tool gracefully fails and the agent falls back to static fetching.
let puppeteer = null;
let puppeteerAvailable = false;

// Attempt to load puppeteer-core synchronously via dynamic import at module level
// This works because this is an ES module loaded asynchronously by Node
try {
  const mod = await import('puppeteer-core');
  puppeteer = mod.default ?? mod;
  puppeteerAvailable = true;
  logger.debug('puppeteer-core loaded successfully');
} catch {
  // Puppeteer not installed — tool will degrade gracefully
}

/**
 * Common Chrome executable paths per platform.
 * Tried in order until one is found.
 */
const CHROME_PATHS = {
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA ?? '') + '\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ],
};

function findChromePath() {
  const platform = process.platform;
  const paths = CHROME_PATHS[platform] ?? CHROME_PATHS.linux;
  for (const p of paths) {
    try {
      if (existsSync(p)) return p;
    } catch { /* continue */ }
  }
  return paths[0] ?? null; // Return first path even if not found — let Puppeteer give the error
}


/**
 * Render a JavaScript-heavy page with headless Chrome.
 *
 * @param {string} url
 * @param {{ timeout?: number, waitForSelector?: string }} opts
 * @returns {Promise<ToolResult>}
 */
export async function run(url, opts = {}) {
  if (!puppeteerAvailable || !puppeteer) {
    return {
      success: false,
      toolName: 'renderDynamicPage',
      data: null,
      error: 'puppeteer-core is not installed. Install it with: npm install puppeteer-core',
      errorCode: 'E_PUPPETEER_UNAVAILABLE',
    };
  }

  const timeout = opts.timeout ?? env.SCRAPER_REQUEST_TIMEOUT_MS;
  const chromePath = findChromePath();
  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,800',
      ],
    });

    const page = await browser.newPage();

    // Block unnecessary resource types to speed up rendering
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent(env.SCRAPER_USER_AGENT);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
    });

    const start = Date.now();

    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    // Wait for optional selector (e.g., main content container)
    if (opts.waitForSelector) {
      try {
        await page.waitForSelector(opts.waitForSelector, { timeout: 5000 });
      } catch {
        // Selector not found — content may still be usable
      }
    }

    const html = await page.content();
    const finalUrl = page.url();
    const responseTimeMs = Date.now() - start;

    return {
      success: true,
      toolName: 'renderDynamicPage',
      data: {
        html,
        finalUrl,
        statusCode: 200, // Puppeteer doesn't expose status easily after navigation
        responseTimeMs,
        byteLength: html.length,
        isJsHeavy: true, // This tool is only used for JS-heavy pages
      },
    };
  } catch (err) {
    logger.warn(`Puppeteer render failed for ${url}: ${err.message}`);
    return {
      success: false,
      toolName: 'renderDynamicPage',
      data: null,
      error: err.message,
      errorCode: 'E_PUPPETEER_FAILED',
    };
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
  }
}

/** Whether Puppeteer is available in this environment. */
export function isAvailable() {
  return puppeteerAvailable;
}

export const meta = {
  name: 'renderDynamicPage',
  description: 'Renders a JavaScript-heavy page using headless Chrome via Puppeteer. Falls back gracefully if Chrome is not available.',
  inputSchema: { url: 'string', timeout: 'number?', waitForSelector: 'string?' },
  recommendedFor: 'Single-page applications and JavaScript-rendered pages',
};
