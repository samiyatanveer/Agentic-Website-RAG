/**
 * rag.service.js
 * RAG pipeline orchestrator.
 *
 * Flow:
 *   question → embed query → ChromaDB retrieval → build prompt → Ollama → save + return
 *
 * SRP: Coordinates the full RAG cycle for one chat turn.
 *      Delegates embedding to pipeline.service, generation to ollama.service,
 *      persistence to conversation/message services.
 */

import { searchSimilar }                     from '../embeddings/pipeline.service.js';
import { generate }                          from '../llm/ollama.service.js';
import { buildRagPrompt, buildFallbackPrompt } from './prompt.service.js';
import * as conversationService              from '../database/conversation.service.js';
import * as messageService                   from '../database/message.service.js';
import { createError }                       from '../../utils/errorHandler.js';
import { ERROR_CODES }                       from '../../config/constants.js';
import logger                                from '../../utils/logger.js';
import env                                   from '../../config/env.js';

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run a full RAG cycle for one user message.
 *
 * @param {{
 *   websiteId: string,
 *   message: string,
 *   conversationId?: string,
 * }} params
 * @returns {Promise<RagResponse>}
 */
export async function chat({ websiteId, message, conversationId }) {
  if (!websiteId || !message?.trim()) {
    throw createError(ERROR_CODES.INVALID_INPUT, 'websiteId and message are required', 400);
  }

  logger.info('[RAG] Chat request', { websiteId, conversationId, messageLen: message.length });

  // 1. Load or create conversation
  let conversation;
  if (conversationId) {
    conversation = await conversationService.getConversation(conversationId);
    if (!conversation) {
      throw createError(ERROR_CODES.NOT_FOUND, `Conversation ${conversationId} not found`, 404);
    }
  } else {
    conversation = await conversationService.createConversation(websiteId);
    logger.debug('[RAG] Created new conversation', { conversationId: conversation.id });
  }

  // 2. Load conversation history for context
  const history = await messageService.getRecentMessages(
    conversation.id,
    env.RAG_MAX_HISTORY ?? 10
  );

  // 3. Retrieve relevant chunks from ChromaDB
  let results = [];
  let confidence = 'none';

  try {
    results = await searchSimilar(message, {
      websiteId,
      nResults:  env.RAG_N_RESULTS  ?? 5,
      threshold: env.RAG_SIMILARITY_THRESHOLD ?? 0.6,
    });

    if (results.length > 0) {
      confidence = results[0].score >= 0.75 ? 'high' : 'medium';
    }

    // Fallback: if no results pass threshold, try without threshold
    if (results.length === 0) {
      results = await searchSimilar(message, {
        websiteId,
        nResults:  3,
        threshold: 0,  // no threshold — get closest even if low confidence
      });
      if (results.length > 0) confidence = 'low';
    }

    logger.debug('[RAG] Retrieved chunks', { count: results.length, confidence });
  } catch (err) {
    // ChromaDB or Ollama embed error — degrade gracefully
    logger.warn('[RAG] Retrieval failed, using fallback prompt', { error: err.message });
  }

  // 4. Build the prompt
  let prompt;
  let sourceUrls = [];

  if (results.length === 0) {
    prompt = buildFallbackPrompt(message);
    confidence = 'none';
  } else {
    const built  = buildRagPrompt(message, results, history);
    prompt       = built.prompt;
    sourceUrls   = built.sourceUrls;
  }

  // 5. Call Ollama
  let answer;
  try {
    answer = await generate(prompt);
  } catch (err) {
    if (err.code === ERROR_CODES.OLLAMA_OFFLINE) throw err; // propagate — client must know
    throw createError(ERROR_CODES.UNKNOWN, `LLM generation failed: ${err.message}`, 500);
  }

  // 6. Persist user message + assistant response
  await messageService.createMessage(conversation.id, 'user',      message);
  await messageService.createMessage(conversation.id, 'assistant', answer);

  // 7. Build sources array for the response
  const sources = results.map((r) => ({
    url:        r.metadata?.pageUrl   ?? null,
    title:      r.metadata?.pageTitle ?? null,
    chunkIndex: r.metadata?.chunkIndex ?? null,
    score:      Math.round(r.score * 100) / 100,
  }));

  logger.info('[RAG] Chat complete', {
    conversationId: conversation.id,
    confidence,
    sourceCount: sources.length,
    answerLen: answer.length,
  });

  return {
    conversationId: conversation.id,
    websiteId,
    answer,
    sources,
    confidence,
    metadata: {
      chunksRetrieved: results.length,
      model: env.OLLAMA_MODEL,
    },
  };
}

/**
 * @typedef {Object} RagResponse
 * @property {string}   conversationId
 * @property {string}   websiteId
 * @property {string}   answer
 * @property {{ url: string, title: string, score: number }[]} sources
 * @property {'high'|'medium'|'low'|'none'} confidence
 * @property {object}   metadata
 */
