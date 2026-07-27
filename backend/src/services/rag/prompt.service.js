/**
 * prompt.service.js
 * Build the final prompt string sent to Ollama.
 *
 * SRP: Assembles system instructions, retrieved context, conversation
 *      history, and the user question into a single prompt string.
 *      Does NOT call Ollama, retrieve chunks, or touch the DB.
 */

import env from '../../config/env.js';
import { estimateTokens } from '../../utils/tokenCounter.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CONTEXT_TOKENS  = 2048;
const MAX_HISTORY_TOKENS  = 1024;
const MAX_HISTORY_MSGS    = env.RAG_MAX_HISTORY ?? 10;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the full RAG prompt from retrieved chunks and conversation history.
 *
 * @param {string} question - The user's current question
 * @param {import('../embeddings/chroma.service.js').SimilarityResult[]} results - ChromaDB results
 * @param {{ role: 'user'|'assistant', content: string }[]} history - Prior messages
 * @returns {{ prompt: string, contextUsed: string, sourceUrls: string[] }}
 */
export function buildRagPrompt(question, results, history = []) {
  const { contextText, sourceUrls } = formatContext(results);
  const historyText = formatHistory(history);

  const prompt = `You are a helpful assistant that answers questions based ONLY on the provided context from scraped websites.
You are truthful and admit when you don't know something.

CONTEXT (from scraped website content):
${contextText}

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n` : ''}
USER QUESTION: ${question}

IMPORTANT:
1. Answer based ONLY on the context provided above.
2. If the context doesn't contain the answer, say: "I don't have that information in the provided context."
3. Keep answers concise and accurate (2-4 sentences).
4. Do not make up information.

ANSWER:`;

  return { prompt, contextUsed: contextText, sourceUrls };
}

/**
 * Build a fallback prompt when no relevant context was found.
 *
 * @param {string} question
 * @returns {string}
 */
export function buildFallbackPrompt(question) {
  return `You are a helpful assistant. The user asked: "${question}"

No relevant information was found in the scraped website content for this question.
Tell the user politely that you don't have that information in the provided context,
and suggest they scrape a relevant website or ask a different question.

ANSWER:`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Format ChromaDB results into a context block and source list.
 * Truncates context if it exceeds MAX_CONTEXT_TOKENS.
 */
function formatContext(results) {
  if (!results || results.length === 0) {
    return { contextText: 'No relevant context found.', sourceUrls: [] };
  }

  const sourceUrls = [...new Set(results.map((r) => r.metadata?.pageUrl).filter(Boolean))];
  let contextText  = '';
  let tokenCount   = 0;

  for (const [i, result] of results.entries()) {
    const source  = result.metadata?.pageUrl ?? 'Unknown source';
    const snippet = `[Source ${i + 1}: ${source}]\n${result.text}\n\n`;
    const tokens  = estimateTokens(snippet);

    if (tokenCount + tokens > MAX_CONTEXT_TOKENS) break;

    contextText += snippet;
    tokenCount  += tokens;
  }

  return { contextText: contextText.trim(), sourceUrls };
}

/**
 * Format conversation history into a text block.
 * Trims to MAX_HISTORY_MSGS and MAX_HISTORY_TOKENS.
 */
function formatHistory(history) {
  if (!history || history.length === 0) return '';

  // Keep only the most recent messages
  const trimmed = history.slice(-MAX_HISTORY_MSGS);

  // Further trim by token count (from oldest end)
  let tokenCount = 0;
  const kept = [];

  for (let i = trimmed.length - 1; i >= 0; i--) {
    const msg    = trimmed[i];
    const line   = `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`;
    const tokens = estimateTokens(line);

    if (tokenCount + tokens > MAX_HISTORY_TOKENS) break;
    kept.unshift(line);
    tokenCount += tokens;
  }

  return kept.join('\n');
}
