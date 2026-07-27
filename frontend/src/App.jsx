import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

// ─── API helpers ──────────────────────────────────────────────────────────────
async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || `HTTP ${r.status}`);
  return json.data;
}

async function apiGet(path) {
  const r = await fetch(`${API}${path}`);
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || `HTTP ${r.status}`);
  return json.data;
}

// ─── Components ───────────────────────────────────────────────────────────────

function Spinner({ size = 16 }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid rgba(56,189,248,0.3)`,
      borderTopColor: 'var(--accent)',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function ScrapeForm({ onScraped }) {
  const [url, setUrl]       = useState('');
  const [loading, setLoading] = useState(false);
  const [jobId, setJobId]   = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError]   = useState(null);
  const pollRef = useRef(null);

  const startScrape = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError(null);
    setLoading(true);
    setStatus('Queueing scrape job…');
    try {
      const data = await apiPost('/scrape', { url: url.trim() });
      setJobId(data.jobId);
      pollStatus(data.jobId, data.websiteId);
    } catch (err) {
      if (err.message.includes('already been scraped')) {
        setError('This website is already scraped. Select it from the sidebar.');
      } else {
        setError(err.message);
      }
      setLoading(false);
      setStatus(null);
    }
  };

  const pollStatus = (jId, wId) => {
    pollRef.current = setInterval(async () => {
      try {
        const s = await apiGet(`/scrape/${jId}/status`);
        const pct = s.progress_percent ?? 0;
        const pages = s.pages_scraped ?? s.pages_crawled ?? 0;
        setStatus(`Scraping… ${pages} pages (${pct}%)`);

        if (s.status === 'completed') {
          clearInterval(pollRef.current);
          setStatus(`✅ Done — ${pages} pages scraped. Embedding in background…`);
          setLoading(false);
          setJobId(null);
          setTimeout(() => {
            setStatus(null);
            setUrl('');
            onScraped(wId);
          }, 2000);
        } else if (s.status === 'failed') {
          clearInterval(pollRef.current);
          setError(`Scrape failed: ${s.error_message ?? 'unknown error'}`);
          setStatus(null);
          setLoading(false);
        }
      } catch { /* poll errors are transient */ }
    }, 2000);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);

  return (
    <div style={{ padding: 'var(--space-4)' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Add Website</p>
      <form onSubmit={startScrape} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <input
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          required
          style={{
            background: 'var(--surface-input)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 'var(--space-2) var(--space-3)',
            color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
            outline: 'none', width: '100%',
          }}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          style={{
            background: loading ? 'var(--surface)' : 'var(--accent)',
            color: loading ? 'var(--text-muted)' : 'var(--text-inverse)',
            border: 'none', borderRadius: 'var(--radius)',
            padding: 'var(--space-2) var(--space-4)',
            fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)', justifyContent: 'center',
          }}
        >
          {loading && <Spinner size={14} />}
          {loading ? 'Scraping…' : 'Scrape Website'}
        </button>
      </form>
      {status && <p style={{ color: 'var(--accent)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>{status}</p>}
      {error && <p style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>{error}</p>}
    </div>
  );
}

function WebsiteList({ websites, selectedId, onSelect }) {
  if (websites.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', textAlign: 'center' }}>
        No websites scraped yet.<br />Add one above ↑
      </div>
    );
  }

  return (
    <div>
      <p style={{ padding: '0 var(--space-4)', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Websites ({websites.length})
      </p>
      {websites.map((w) => (
        <div
          key={w.id}
          onClick={() => onSelect(w)}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            cursor: 'pointer',
            background: selectedId === w.id ? 'var(--surface-active)' : 'transparent',
            borderLeft: selectedId === w.id ? '2px solid var(--accent)' : '2px solid transparent',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => { if (selectedId !== w.id) e.currentTarget.style.background = 'var(--surface-hover)'; }}
          onMouseLeave={(e) => { if (selectedId !== w.id) e.currentTarget.style.background = 'transparent'; }}
        >
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {w.title || new URL(w.url).hostname}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {w.url}
          </div>
          {w.total_chunks > 0 && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--success)', marginTop: 2 }}>
              {w.total_pages} pages · {w.total_chunks} chunks embedded
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SourceBadge({ source }) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((source.score ?? 0) * 100);
  return (
    <span
      onClick={() => setExpanded(!expanded)}
      title={source.url}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'var(--accent-dim)', color: 'var(--accent)',
        borderRadius: 'var(--radius-sm)', padding: '2px 8px',
        fontSize: 'var(--text-xs)', cursor: 'pointer',
        border: '1px solid rgba(56,189,248,0.2)',
      }}
    >
      🔗 {expanded ? source.url : (source.title || new URL(source.url).hostname)} ({pct}%)
    </span>
  );
}

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 'var(--space-4)',
    }}>
      <div style={{
        maxWidth: '80%',
        background: isUser ? 'var(--accent-dim)' : 'var(--surface)',
        border: `1px solid ${isUser ? 'rgba(56,189,248,0.2)' : 'var(--border)'}`,
        borderRadius: isUser ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)' : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
        padding: 'var(--space-3) var(--space-4)',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-relaxed)',
      }}>
        {msg.content}
      </div>
      {msg.sources && msg.sources.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)', maxWidth: '80%' }}>
          {msg.sources.map((s, i) => (
            <SourceBadge key={i} source={s} />
          ))}
        </div>
      )}
      {msg.confidence && msg.confidence !== 'none' && (
        <span style={{
          fontSize: 'var(--text-xs)', marginTop: 4,
          color: msg.confidence === 'high' ? 'var(--success)' : msg.confidence === 'medium' ? 'var(--warning)' : 'var(--text-muted)',
        }}>
          {msg.confidence === 'high' ? '● High confidence' : msg.confidence === 'medium' ? '◐ Medium confidence' : '○ Low confidence'}
        </span>
      )}
    </div>
  );
}

function ChatInterface({ website }) {
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [conversationId, setConvId] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setConvId(null);
    setError(null);
    setInput('');
  }, [website?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const data = await apiPost('/chat', {
        websiteId: website.id,
        message: text,
        conversationId,
      });

      setConvId(data.conversationId);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.content,
        sources: data.sources,
        confidence: data.confidence,
      }]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const hostname = (() => { try { return new URL(website.url).hostname; } catch { return website.url; } })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat header */}
      <div style={{
        padding: 'var(--space-3) var(--space-6)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
        <span style={{ color: 'var(--text-primary)', fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-sm)' }}>
          {hostname}
        </span>
        {website.total_chunks > 0 && (
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            · {website.total_chunks} chunks indexed
          </span>
        )}
        {conversationId && (
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
            conv: {conversationId.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column' }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 'var(--space-4)' }}>💬</div>
            <div style={{ fontSize: 'var(--text-sm)' }}>Ask anything about <strong style={{ color: 'var(--text-secondary)' }}>{hostname}</strong></div>
            <div style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-2)' }}>
              {website.total_chunks > 0
                ? `${website.total_chunks} chunks ready for search`
                : 'Embeddings may still be processing — try asking a question'}
            </div>
          </div>
        )}

        {messages.map((m, i) => <Message key={i} msg={m} />)}

        {loading && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
            <Spinner size={14} />
            Searching context and generating answer…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: 'var(--space-4) var(--space-6)',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
      }}>
        {error && (
          <div style={{ color: 'var(--error)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'var(--error-dim)', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <textarea
            placeholder="Ask a question… (Enter to send)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={loading}
            rows={1}
            style={{
              flex: 1, resize: 'none',
              background: 'var(--surface-input)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: 'var(--space-3)',
              color: 'var(--text-primary)', fontSize: 'var(--text-sm)',
              outline: 'none', lineHeight: 'var(--leading-normal)',
              fontFamily: 'var(--font-sans)',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--border-focus)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: (!loading && input.trim()) ? 'var(--accent)' : 'var(--surface)',
              color: (!loading && input.trim()) ? 'var(--text-inverse)' : 'var(--text-muted)',
              border: 'none', borderRadius: 'var(--radius)',
              padding: 'var(--space-2) var(--space-4)',
              fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-sm)',
              cursor: (!loading && input.trim()) ? 'pointer' : 'not-allowed',
              flexShrink: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            }}
          >
            {loading ? <Spinner size={14} /> : '↑ Send'}
          </button>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
          Answers are grounded in scraped content only · Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [websites, setWebsites]       = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loadingList, setLoadingList] = useState(true);

  const loadWebsites = useCallback(async () => {
    try {
      const data = await apiGet('/websites');
      setWebsites(data.websites ?? []);
    } catch {
      setWebsites([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { loadWebsites(); }, [loadWebsites]);

  const handleScraped = (websiteId) => {
    loadWebsites().then(() => {
      setWebsites((prev) => {
        const w = prev.find((x) => x.id === websiteId);
        if (w) setSelected(w);
        return prev;
      });
    });
  };

  // When website list reloads, keep selected in sync
  useEffect(() => {
    if (selected) {
      const updated = websites.find((w) => w.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [websites]);

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--font-sans); background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div style={{
          width: 'var(--sidebar-width)', flexShrink: 0,
          background: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* Brand */}
          <div style={{
            padding: 'var(--space-4)',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, flexShrink: 0,
            }}>
              🤖
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>Website RAG</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Local AI Chat</div>
            </div>
          </div>

          <ScrapeForm onScraped={handleScraped} />

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)', flex: 1 }}>
            {loadingList ? (
              <div style={{ padding: 'var(--space-4)', display: 'flex', justifyContent: 'center' }}>
                <Spinner size={18} />
              </div>
            ) : (
              <WebsiteList
                websites={websites}
                selectedId={selected?.id}
                onSelect={setSelected}
              />
            )}
          </div>
        </div>

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-primary)' }}>
          {selected ? (
            <ChatInterface website={selected} />
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>
              <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>🌐</div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)' }}>
                Chat with any website
              </div>
              <div style={{ fontSize: 'var(--text-sm)', maxWidth: 400, lineHeight: 'var(--leading-relaxed)' }}>
                Paste a URL in the sidebar to scrape it, then ask questions.<br />
                Answers are grounded in real scraped content — no hallucination.
              </div>
              {websites.length > 0 && (
                <div style={{ marginTop: 'var(--space-6)', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
                  ← Select a website from the sidebar to start chatting
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
