/**
 * tokenCounter.js
 * Lightweight token estimation utility.
 *
 * Uses whitespace splitting as a fast approximation.
 * Accurate enough for context window management without a full tokenizer.
 * Rule of thumb: 1 token ≈ 4 characters (English text).
 */

/**
 * Estimate the number of tokens in a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Truncate text to a maximum number of tokens.
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string} Truncated text
 */
export function truncateToTokens(text, maxTokens) {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= maxTokens) return text;
  return words.slice(0, maxTokens).join(' ') + '…';
}

/**
 * Estimate total tokens in an array of message objects.
 * @param {{ role: string, content: string }[]} messages
 * @returns {number}
 */
export function estimateHistoryTokens(messages) {
  return messages.reduce((total, msg) => {
    return total + estimateTokens(msg.content) + 4; // +4 for role overhead
  }, 0);
}
