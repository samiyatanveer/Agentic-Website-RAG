/**
 * prompt.service.js
 * Build the final prompt string sent to Ollama.
 *
 * SRP: Assembles system instructions, retrieved context, conversation
 * history, and the user question into a single prompt string.
 *
 * Does NOT:
 * - Call Ollama
 * - Retrieve chunks
 * - Access SQLite or ChromaDB
 */

import env from '../../config/env.js';
import { estimateTokens } from '../../utils/tokenCounter.js';

// ─── Configuration ────────────────────────────────────────────────────────────

// Maximum website context sent to the LLM.
// 2048 is okay for speed, but 3500 allows richer answers.
const MAX_CONTEXT_TOKENS = 3500;

// Maximum previous conversation content.
const MAX_HISTORY_TOKENS = 800;

// Number of recent messages to include.
const MAX_HISTORY_MSGS = env.RAG_MAX_HISTORY ?? 6;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the RAG prompt using:
 * 1. Retrieved website chunks
 * 2. Previous conversation messages
 * 3. The current user question
 *
 * @param {string} question
 * @param {import('../embeddings/chroma.service.js').SimilarityResult[]} results
 * @param {{ role: 'user'|'assistant', content: string }[]} history
 *
 * @returns {{
 *   prompt: string,
 *   contextUsed: string,
 *   sourceUrls: string[]
 * }}
 */
export function buildRagPrompt(question, results, history = []) {
  const { contextText, sourceUrls } = formatContext(results);

  const historyText = formatHistory(history);

  const prompt = `
You are a knowledgeable website assistant.

Your job is to answer the user's question using ONLY the website content
provided in the CONTEXT section.

You may combine information from multiple context sources when they are
relevant to the question.

====================
WEBSITE CONTEXT
====================

${contextText}

====================
${historyText
  ? `CONVERSATION HISTORY\n====================\n${historyText}`
  : 'NO PREVIOUS CONVERSATION'
}

====================
USER QUESTION
====================

${question}

====================
ANSWERING RULES
====================

1. Use ONLY information present in the WEBSITE CONTEXT.

2. Do not use outside knowledge.

3. Do not invent, guess, or add information that is missing.

4. Match the answer length to the user's question:

   - For a simple factual question, give a short direct answer.
   - For a "why", "how", "explain", "describe", or comparison question,
     give a detailed explanation.
   - For broad questions such as "Tell me about this website",
     provide a structured overview using multiple relevant details.
   - If multiple relevant points are available, explain them clearly.

5. When useful, use:
   - Short paragraphs
   - Bullet points
   - Clear headings

6. Do not repeat the same information.

7. If the answer is not present in the context, say exactly:

"I don't have that information in the provided website content."

8. Do not mention:
   - ChromaDB
   - embeddings
   - chunks
   - vector databases
   - internal retrieval systems

9. Answer naturally and directly. Do not say:
"Based on the provided context" unless necessary.

====================
FINAL ANSWER
====================
`;

  return {
    prompt: prompt.trim(),
    contextUsed: contextText,
    sourceUrls,
  };
}

/**
 * Build a fallback prompt when no relevant website context is found.
 *
 * @param {string} question
 * @returns {string}
 */
export function buildFallbackPrompt(question) {
  return `
You are a website assistant.

The user asked:

"${question}"

No relevant information was found in the scraped website content.

Politely tell the user:

"I don't have that information in the provided website content."

Do not answer using outside knowledge.
Do not guess or invent information.
Do not claim that you searched the internet.

ANSWER:
`.trim();
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Convert retrieved ChromaDB results into a readable context block.
 *
 * @param {Array} results
 *
 * @returns {{
 *   contextText: string,
 *   sourceUrls: string[]
 * }}
 */
function formatContext(results) {
  if (!results || results.length === 0) {
    return {
      contextText: 'No relevant website content was retrieved.',
      sourceUrls: [],
    };
  }

  const sourceUrls = [
    ...new Set(
      results
        .map((result) => result.metadata?.pageUrl)
        .filter(Boolean)
    ),
  ];

  let contextText = '';
  let tokenCount = 0;

  for (const [index, result] of results.entries()) {
    const source =
      result.metadata?.pageUrl ??
      'Unknown website page';

    const title =
      result.metadata?.pageTitle ??
      'Untitled page';

    const snippet = `
[Source ${index + 1}]
Title: ${title}
URL: ${source}

${result.text}

`;

    const tokens = estimateTokens(snippet);

    // Stop before exceeding the context limit.
    if (tokenCount + tokens > MAX_CONTEXT_TOKENS) {
      break;
    }

    contextText += snippet;
    tokenCount += tokens;
  }

  return {
    contextText: contextText.trim(),
    sourceUrls,
  };
}

/**
 * Format recent conversation messages.
 *
 * @param {{ role: string, content: string }[]} history
 *
 * @returns {string}
 */
function formatHistory(history) {
  if (!history || history.length === 0) {
    return '';
  }

  // Keep only recent messages.
  const recentMessages =
    history.slice(-MAX_HISTORY_MSGS);

  let tokenCount = 0;

  const keptMessages = [];

  // Add newest messages first, while respecting the token limit.
  for (
    let index = recentMessages.length - 1;
    index >= 0;
    index--
  ) {
    const message =
      recentMessages[index];

    const speaker =
      message.role === 'user'
        ? 'User'
        : 'Assistant';

    const line =
      `${speaker}: ${message.content}`;

    const tokens =
      estimateTokens(line);

    if (
      tokenCount + tokens >
      MAX_HISTORY_TOKENS
    ) {
      break;
    }

    keptMessages.unshift(line);

    tokenCount += tokens;
  }

  return keptMessages.join('\n');
}