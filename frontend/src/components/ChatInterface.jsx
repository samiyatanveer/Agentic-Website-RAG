import { useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import { getHostname } from '../utils/url';
import ChatMessage from './ChatMessage';
import Spinner from './Spinner';

export default function ChatInterface({ website }) {
  const bottomRef = useRef(null);
  const { messages, input, setInput, isLoading, error, conversationId, sendMessage } = useChat(website.id);
  const hostname = getHostname(website.url);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const canSend = !isLoading && input.trim();

  return (
    <section className="chat-panel" aria-label={`Chat with ${hostname}`}>
      <header className="chat-panel__header">
        <span className="chat-panel__status" aria-label="Website selected" />
        <div className="chat-panel__website"><span className="chat-panel__label">Active website</span><strong>{hostname}</strong></div>
        {website.total_chunks > 0 && <span className="badge badge-success">{website.total_chunks} chunks indexed</span>}
        {conversationId && <span className="chat-panel__conversation">Conversation {conversationId.slice(0, 8)}</span>}
      </header>
      <div className="chat-panel__messages">
        {messages.length === 0 && <div className="chat-empty"><div className="chat-empty__icon" aria-hidden="true">AI</div><h1>Ask about {hostname}</h1><p>{website.total_chunks > 0 ? `${website.total_chunks} chunks are ready to search.` : 'Embeddings may still be processing. You can still try a question.'}</p></div>}
        {messages.map((message, index) => <ChatMessage key={`${message.role}-${index}`} message={message} />)}
        {isLoading && <div className="chat-loading" role="status"><Spinner size={14} />Searching context and generating an answer...</div>}
        <div ref={bottomRef} />
      </div>
      <footer className="chat-panel__composer">
        {error && <div className="chat-error" role="alert">{error}</div>}
        <div className="chat-composer__row">
          <textarea className="input chat-composer__input" placeholder="Ask a question..." value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={handleKeyDown} disabled={isLoading} rows={1} aria-label="Chat message" />
          <button className="btn btn-primary chat-composer__send" type="button" onClick={sendMessage} disabled={!canSend}>{isLoading ? <Spinner size={14} /> : 'Send'}</button>
        </div>
        <p className="chat-composer__hint">Grounded in scraped content only · Enter to send · Shift+Enter for a new line</p>
      </footer>
    </section>
  );
}
