import { useCallback, useEffect, useState } from 'react';
import { sendChatMessage } from '../services/chatService';

export function useChat(websiteId) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);

  useEffect(() => {
    setMessages([]);
    setInput('');
    setError(null);
    setConversationId(null);
  }, [websiteId]);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || isLoading || !websiteId) return;

    setInput('');
    setError(null);
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setIsLoading(true);

    try {
      const response = await sendChatMessage({ websiteId, message, conversationId });
      setConversationId(response.conversationId);
      setMessages((current) => [...current, {
        role: 'assistant',
        content: response.content,
        sources: response.sources,
        confidence: response.confidence,
      }]);
    } catch (requestError) {
      setError(requestError.message);
      setMessages((current) => [...current, {
        role: 'assistant',
        content: `Error: ${requestError.message}`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, input, isLoading, websiteId]);

  return {
    messages,
    input,
    setInput,
    isLoading,
    error,
    conversationId,
    sendMessage,
  };
}
