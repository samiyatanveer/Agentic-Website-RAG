/**
 * conversation.controller.js
 * GET    /api/conversations      — List conversations (filter by ?websiteId=)
 * GET    /api/conversations/:id  — Full conversation with messages
 * DELETE /api/conversations/:id  — Delete a conversation
 */

import { createSuccessResponse, handleError } from '../utils/errorHandler.js';
import * as conversationService from '../services/database/conversation.service.js';
import * as messageService      from '../services/database/message.service.js';
import logger                   from '../utils/logger.js';

export async function listConversations(req, res) {
  try {
    const { websiteId } = req.query;
    const conversations = websiteId
      ? await conversationService.getConversationsByWebsite(websiteId)
      : [];

    return res.status(200).json(createSuccessResponse({ conversations }));
  } catch (error) {
    logger.error('listConversations error', { error: error.message });
    return res.status(500).json(handleError(error, 'conversation.controller.listConversations'));
  }
}

export async function getConversation(req, res) {
  try {
    const { id } = req.params;
    const conversation = await conversationService.getConversationById(id);

    if (!conversation) {
      return res.status(404).json({ success: false, error: { message: 'Conversation not found', statusCode: 404 } });
    }

    const messages = await messageService.getMessagesByConversation(id);

    return res.status(200).json(createSuccessResponse({
      conversationId: conversation.id,
      websiteId:      conversation.website_id,
      created_at:     conversation.created_at,
      messages: messages.map((m) => ({
        messageId:  m.id,
        role:       m.role,
        content:    m.content,
        created_at: m.created_at,
      })),
    }));
  } catch (error) {
    logger.error('getConversation error', { error: error.message });
    return res.status(500).json(handleError(error, 'conversation.controller.getConversation'));
  }
}

export async function deleteConversation(req, res) {
  try {
    const { id } = req.params;
    const conversation = await conversationService.getConversationById(id);

    if (!conversation) {
      return res.status(404).json({ success: false, error: { message: 'Conversation not found', statusCode: 404 } });
    }

    await conversationService.deleteConversation(id);
    return res.status(200).json(createSuccessResponse({ message: 'Conversation deleted', conversationId: id }));
  } catch (error) {
    logger.error('deleteConversation error', { error: error.message });
    return res.status(500).json(handleError(error, 'conversation.controller.deleteConversation'));
  }
}

export default { listConversations, getConversation, deleteConversation };
