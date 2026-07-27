/**
 * chat.controller.js
 * POST /api/chat — RAG-powered chat endpoint (Phase 6+7)
 */

import { createSuccessResponse, handleError, createError } from '../utils/errorHandler.js';
import { chat as ragChat } from '../services/rag/rag.service.js';
import { ERROR_CODES }     from '../config/constants.js';
import logger              from '../utils/logger.js';

export async function chat(req, res) {
  try {
    const { websiteId, message, conversationId } = req.body;
    logger.info('Chat request', { websiteId, conversationId });

    const result = await ragChat({ websiteId, message, conversationId });

    return res.status(200).json(createSuccessResponse({
      conversationId: result.conversationId,
      websiteId:      result.websiteId,
      content:        result.answer,
      sources:        result.sources,
      confidence:     result.confidence,
      metadata:       result.metadata,
    }));
  } catch (error) {
    if (error.code === ERROR_CODES.OLLAMA_OFFLINE) {
      return res.status(503).json({
        success: false,
        error: {
          code:       error.code,
          message:    error.message,
          recovery:   "Run: ollama serve && ollama pull mistral",
          statusCode: 503,
        },
      });
    }
    if (error.code === ERROR_CODES.NOT_FOUND) {
      return res.status(404).json({ success: false, error: { message: error.message, statusCode: 404 } });
    }
    logger.error('Chat controller error', { error: error.message });
    return res.status(500).json(handleError(error, 'chat.controller.chat'));
  }
}

export default { chat };
