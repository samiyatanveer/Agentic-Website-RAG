import { getHostname } from '../utils/url';

export default function WebsiteList({ websites, selectedId, onSelect }) {
  if (websites.length === 0) {
    return <div className="website-list__empty">No websites scraped yet.<br />Add one above.</div>;
  }

  return (
    <section className="website-list" aria-label="Scraped websites">
      <p className="website-list__heading">Websites <span>{websites.length}</span></p>
      {websites.map((website) => (
        <button key={website.id} type="button" className={`website-list__item ${selectedId === website.id ? 'website-list__item--selected' : ''}`} onClick={() => onSelect(website)} aria-pressed={selectedId === website.id}>
          <span className="website-list__title">{website.title || getHostname(website.url)}</span>
          <span className="website-list__url">{website.url}</span>
          {website.total_chunks > 0 && <span className="website-list__stats">{website.total_pages} pages · {website.total_chunks} chunks indexed</span>}
        </button>
      ))}
    </section>
  );
}
