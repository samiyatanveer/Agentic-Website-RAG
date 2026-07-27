/**
 * sleep.js
 * Async sleep / delay utility.
 * Used by rate limiters and retry logic.
 *
 * Usage:
 *   import sleep from '../utils/sleep.js';
 *   await sleep(2000); // wait 2 seconds
 */

/**
 * Resolves a promise after the given number of milliseconds.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export default function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
