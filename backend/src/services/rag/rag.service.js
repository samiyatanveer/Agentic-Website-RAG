/**
 * rag.service.js
 * RAG pipeline orchestrator.
 *
 * Flow:
 * question → embed query → ChromaDB retrieval → build prompt
 * → Ollama → save + return
 */

import { searchSimilar } from '../embeddings/pipeline.service.js';
import { generate } from '../llm/ollama.service.js';
import {
  buildRagPrompt,
  buildFallbackPrompt,
} from './prompt.service.js';

import * as conversationService from '../database/conversation.service.js';
import * as messageService from '../database/message.service.js';

import { createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';

// ─── Main RAG function ───────────────────────────────────────────────────────

/**
 * Run one complete RAG chat cycle.
 *
 * @param {{
 *   websiteId: string,
 *   message: string,
 *   conversationId?: string
 * }} params
 *
 * @returns {Promise<object>}
 */
export async function chat({
  websiteId,
  message,
  conversationId,
}) {
  // ─── Validate input ────────────────────────────────────────────────────────

  if (!websiteId || !message?.trim()) {
    throw createError(
      ERROR_CODES.INVALID_INPUT,
      'websiteId and message are required',
      400
    );
  }

  logger.info(
    '[RAG] Chat request',
    {
      websiteId,
      conversationId,
      messageLen: message.length,
    }
  );

  console.log('\n========== RAG CHAT START ==========');

  console.log(
    'Website ID:',
    websiteId
  );

  console.log(
    'Conversation ID:',
    conversationId ?? 'NEW'
  );

  console.log(
    'Question:',
    message
  );

  console.log(
    '====================================\n'
  );

  // ─── 1. Load or create conversation ───────────────────────────────────────

  let conversation;

  if (conversationId) {
    console.log(
      '[RAG] Loading existing conversation...'
    );

    conversation =
      await conversationService.getConversation(
        conversationId
      );

    if (!conversation) {
      throw createError(
        ERROR_CODES.NOT_FOUND,
        `Conversation ${conversationId} not found`,
        404
      );
    }

    console.log(
      '[RAG] Existing conversation loaded:',
      conversation.id
    );

  } else {
    console.log(
      '[RAG] Creating new conversation...'
    );

    conversation =
      await conversationService.createConversation(
        websiteId
      );

    logger.debug(
      '[RAG] Created new conversation',
      {
        conversationId:
          conversation.id,
      }
    );

    console.log(
      '[RAG] New conversation created:',
      conversation.id
    );
  }

  // ─── 2. Load chat history ─────────────────────────────────────────────────

  console.log(
    '[RAG] Loading conversation history...'
  );

  const history =
    await messageService.getRecentMessages(
      conversation.id,
      env.RAG_MAX_HISTORY ?? 10
    );

  console.log(
    '[RAG] History messages:',
    history.length
  );

  // ─── 3. Retrieve relevant ChromaDB chunks ─────────────────────────────────

  let results = [];

  let confidence =
    'none';

  try {
    console.log(
      '\n========== RAG RETRIEVAL START =========='
    );

    console.log(
      'Calling searchSimilar()...'
    );

    console.log(
      'Question:',
      message
    );

    console.log(
      'Website filter:',
      websiteId
    );

    console.log(
      'Requested results:',
      env.RAG_N_RESULTS ?? 5
    );

    console.log(
      'Similarity threshold:',
      env.RAG_SIMILARITY_THRESHOLD ?? 0.6
    );

    console.log(
      '=========================================\n'
    );

    // First retrieval attempt
    results =
      await searchSimilar(
        message,
        {
          websiteId,

          nResults:
            env.RAG_N_RESULTS ?? 5,

          threshold:
            env.RAG_SIMILARITY_THRESHOLD ??
            0.6,
        }
      );

    console.log(
      '[RAG] First retrieval completed.'
    );

    console.log(
      '[RAG] Results found:',
      results.length
    );

    if (results.length > 0) {
      confidence =
        results[0].score >= 0.75
          ? 'high'
          : 'medium';

      console.log(
        '[RAG] Best score:',
        results[0].score
      );

      console.log(
        '[RAG] Confidence:',
        confidence
      );
    }

    // Second retrieval attempt without threshold
    if (results.length === 0) {
      console.log(
        '\n[RAG] No chunks passed threshold.'
      );

      console.log(
        '[RAG] Trying again with threshold = 0...'
      );

      results =
        await searchSimilar(
          message,
          {
            websiteId,

            nResults:
              3,

            threshold:
              0,
          }
        );

      console.log(
        '[RAG] Fallback retrieval completed.'
      );

      console.log(
        '[RAG] Fallback results:',
        results.length
      );

      if (results.length > 0) {
        confidence =
          'low';
      }
    }

    logger.debug(
      '[RAG] Retrieved chunks',
      {
        count:
          results.length,

        confidence,
      }
    );

    console.log(
      '\n========== RAG RETRIEVAL COMPLETE =========='
    );

    console.log(
      'Final chunk count:',
      results.length
    );

    console.log(
      'Confidence:',
      confidence
    );

    console.log(
      '============================================\n'
    );

  } catch (err) {

    console.error(
      '\n========== RAG RETRIEVAL ERROR =========='
    );

    console.error(
      'Error name:',
      err.name
    );

    console.error(
      'Error message:',
      err.message
    );

    console.error(
      'Error code:',
      err.code
    );

    console.error(
      'HTTP status:',
      err.response?.status
    );

    console.error(
      'Request URL:',
      err.config?.url
    );

    console.error(
      'Response data:',
      JSON.stringify(
        err.response?.data,
        null,
        2
      )
    );

    console.error(
      'Full error:',
      err
    );

    console.error(
      '==========================================\n'
    );

    logger.warn(
      '[RAG] Retrieval failed, using fallback prompt',
      {
        error:
          err.message,
      }
    );

    results = [];
  }

  // ─── 4. Build prompt ───────────────────────────────────────────────────────

  let prompt;

  let sourceUrls =
    [];

  if (results.length === 0) {

    console.log(
      '[RAG] No retrieved chunks.'
    );

    console.log(
      '[RAG] Using fallback prompt.'
    );

    prompt =
      buildFallbackPrompt(
        message
      );

    confidence =
      'none';

  } else {

    console.log(
      '[RAG] Building RAG prompt using',
      results.length,
      'chunks.'
    );

    const built =
      buildRagPrompt(
        message,
        results,
        history
      );

    prompt =
      built.prompt;

    sourceUrls =
      built.sourceUrls;

    console.log(
      '[RAG] RAG prompt created.'
    );
  }

  // ─── 5. Generate answer with Ollama ───────────────────────────────────────

  console.log(
    '\n========== OLLAMA GENERATION =========='
  );

  console.log(
    'Model:',
    env.OLLAMA_MODEL
  );

  console.log(
    'Generating answer...'
  );

  let answer;

  try {

    answer =
      await generate(
        prompt
      );

  } catch (err) {

    console.error(
      '[RAG] Ollama generation failed:',
      err.message
    );

    if (
      err.code ===
      ERROR_CODES.OLLAMA_OFFLINE
    ) {
      throw err;
    }

    throw createError(
      ERROR_CODES.UNKNOWN,
      `LLM generation failed: ${err.message}`,
      500
    );
  }

  console.log(
    'Answer generated.'
  );

  console.log(
    'Answer length:',
    answer.length
  );

  console.log(
    '=======================================\n'
  );

  // ─── 6. Save user and assistant messages ──────────────────────────────────

  console.log(
    '[RAG] Saving chat messages...'
  );

  await messageService.createMessage(
    conversation.id,
    'user',
    message
  );

  await messageService.createMessage(
    conversation.id,
    'assistant',
    answer
  );

  console.log(
    '[RAG] Messages saved successfully.'
  );

  // ─── 7. Build source list ─────────────────────────────────────────────────

  const sources =
    results.map(
      (result) => ({
        url:
          result.metadata?.pageUrl ??
          null,

        title:
          result.metadata?.pageTitle ??
          null,

        chunkIndex:
          result.metadata?.chunkIndex ??
          null,

        score:
          Math.round(
            result.score * 100
          ) / 100,
      })
    );

  logger.info(
    '[RAG] Chat complete',
    {
      conversationId:
        conversation.id,

      confidence,

      sourceCount:
        sources.length,

      answerLen:
        answer.length,
    }
  );

  console.log(
    '\n========== RAG CHAT COMPLETE =========='
  );

  console.log(
    'Conversation:',
    conversation.id
  );

  console.log(
    'Chunks:',
    results.length
  );

  console.log(
    'Confidence:',
    confidence
  );

  console.log(
    'Sources:',
    sources.length
  );

  console.log(
    '=======================================\n'
  );

  return {
    conversationId:
      conversation.id,

    websiteId,

    answer,

    sources,

    confidence,

    metadata: {
      chunksRetrieved:
        results.length,

      model:
        env.OLLAMA_MODEL,
    },
  };
}

/**
 * @typedef {Object} RagResponse
 *
 * @property {string}
 * conversationId
 *
 * @property {string}
 * websiteId
 *
 * @property {string}
 * answer
 *
 * @property {Array}
 * sources
 *
 * @property {
 * 'high' |
 * 'medium' |
 * 'low' |
 * 'none'
 * }
 * confidence
 *
 * @property {object}
 * metadata
 */