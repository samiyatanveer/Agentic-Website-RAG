import { apiPost } from './api';

export function sendChatMessage({ websiteId, message, conversationId }) {
  return apiPost('/chat', { websiteId, message, conversationId });
}
