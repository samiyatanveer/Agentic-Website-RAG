import { getHostname } from '../utils/url';

import { useState } from 'react';

export default function WebsiteList({ websites, selectedId, onSelect, onDelete }) {
  const [confirmingId, setConfirmingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const confirmDelete = async (id) => {
    setDeletingId(id);
    try { await onDelete(id); } finally { setDeletingId(null); setConfirmingId(null); }
  };
  if (websites.length === 0) {
    return <div className="website-list__empty">No websites scraped yet.<br />Add one above.</div>;
  }

  return (
    <section className="website-list" aria-label="Scraped websites">
      <p className="website-list__heading">Websites <span>{websites.length}</span></p>
      {websites.map((website) => (
        <div key={website.id} className={`website-list__item ${selectedId === website.id ? 'website-list__item--selected' : ''}`}>
          <button type="button" className="website-list__select" onClick={() => onSelect(website)} aria-pressed={selectedId === website.id}>
          <span className="website-list__title">{website.title || getHostname(website.url)}</span>
          <span className="website-list__url">{website.url}</span>
          {website.total_chunks > 0 && <span className="website-list__stats">{website.total_pages} pages · {website.total_chunks} chunks indexed</span>}
          </button>
          {confirmingId === website.id ? <div className="website-list__confirm"><span>Are you sure you want to delete this scraped website and all of its stored content? This action cannot be undone.</span><button type="button" className="btn btn-danger" disabled={deletingId === website.id} onClick={() => confirmDelete(website.id)}>{deletingId === website.id ? 'Deleting…' : 'Delete'}</button><button type="button" className="btn btn-secondary" disabled={deletingId === website.id} onClick={() => setConfirmingId(null)}>Cancel</button></div> : <button type="button" className="btn btn-secondary" onClick={() => setConfirmingId(website.id)}>Delete</button>}
        </div>
      ))}
    </section>
  );
}
