import { useState } from 'react';
import { getHostname } from '../utils/url';

function SourceBadge({ source }) {
  const [expanded, setExpanded] = useState(false);
  const percentage = Math.round((source.score ?? 0) * 100);

  return <button type="button" className="source-badge" onClick={() => setExpanded(!expanded)} title={source.url}>Source: {expanded ? source.url : (source.title || getHostname(source.url))} ({percentage}%)</button>;
}

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';
  const confidenceColor = message.confidence === 'high' ? 'var(--success)' : message.confidence === 'medium' ? 'var(--warning)' : 'var(--text-muted)';
  const confidenceLabel = message.confidence === 'high' ? 'High confidence' : message.confidence === 'medium' ? 'Medium confidence' : 'Low confidence';

  return (
    <article className={`chat-message chat-message--${isUser ? 'user' : 'assistant'}`}>
      <div className="chat-message__bubble">{message.content}</div>
      {message.sources?.length > 0 && <div className="chat-message__sources">{message.sources.map((source, index) => <SourceBadge key={`${source.url}-${index}`} source={source} />)}</div>}
      {message.confidence && message.confidence !== 'none' && <span className="chat-message__confidence" style={{ color: confidenceColor }}>{confidenceLabel}</span>}
    </article>
  );
}
