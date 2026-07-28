import ChatInterface from '../components/ChatInterface';
import ScrapeForm from '../components/ScrapeForm';
import Spinner from '../components/Spinner';
import WebsiteList from '../components/WebsiteList';
import { useWebsites } from '../hooks/useWebsites';

export default function DashboardPage() {
  const { websites, selectedWebsite, isLoading, error, refreshWebsites, setSelectedWebsite, selectScrapedWebsite } = useWebsites();

  return (
    <div className="dashboard">
      <aside className="dashboard__sidebar">
        <header className="brand"><div className="brand__mark" aria-hidden="true">R</div><div><strong>Website RAG</strong><span>Local AI chat</span></div></header>
        <ScrapeForm onScraped={selectScrapedWebsite} />
        <div className="dashboard__sources">
          {isLoading && <div className="sidebar-loading"><Spinner size={18} /></div>}
          {!isLoading && error && <div className="sidebar-error" role="alert"><p>{error}</p><button type="button" className="btn btn-secondary" onClick={refreshWebsites}>Try again</button></div>}
          {!isLoading && !error && <WebsiteList websites={websites} selectedId={selectedWebsite?.id} onSelect={setSelectedWebsite} />}
        </div>
      </aside>
      <main className="dashboard__main">
        {selectedWebsite ? <ChatInterface website={selectedWebsite} /> : <section className="dashboard-empty"><div className="dashboard-empty__mark" aria-hidden="true">R</div><p className="eyebrow">Website RAG workspace</p><h1>Chat with a website.</h1><p>Paste a URL in the sidebar, wait for the scrape to finish, then ask questions grounded in that website’s content.</p>{websites.length > 0 && <span className="badge badge-accent">Select a website to continue</span>}</section>}
      </main>
    </div>
  );
}
