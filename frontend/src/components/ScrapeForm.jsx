import { useScrape } from '../hooks/useScrape';
import Spinner from './Spinner';

export default function ScrapeForm({ onScraped }) {
  const { url, setUrl, isLoading, status, error, scrape, duplicateWebsiteId, confirmRescrape, cancelRescrape } = useScrape(onScraped);

  return (
    <section className="scrape-form">
      <div className="section-heading">
        <p className="eyebrow">Knowledge source</p>
        <p className="section-description">Add a website to make it available for grounded chat.</p>
      </div>
      <form onSubmit={scrape} className="scrape-form__fields">
        <input className="input scrape-form__input" type="url" placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} disabled={isLoading} required aria-label="Website URL" />
        <button className="btn btn-primary scrape-form__submit" type="submit" disabled={isLoading || !url.trim()}>
          {isLoading && <Spinner size={14} />}
          {isLoading ? 'Scraping...' : 'Scrape website'}
        </button>
      </form>
      {status && <p className="form-feedback form-feedback--status" role="status">{status}</p>}
      {error && <p className="form-feedback form-feedback--error" role="alert">{error}</p>}
      {duplicateWebsiteId && <div className="form-feedback form-feedback--status" role="dialog" aria-label="Re-scrape confirmation"><p>This website has already been scraped. Do you want to re-scrape it and refresh its content?</p><button type="button" className="btn btn-primary" onClick={confirmRescrape}>Re-scrape</button><button type="button" className="btn btn-secondary" onClick={cancelRescrape}>Cancel</button></div>}
    </section>
  );
}
