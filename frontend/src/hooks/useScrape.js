import { useCallback, useEffect, useRef, useState } from 'react';
import { getScrapeStatus, startScrape } from '../services/scrapeService';

const POLL_INTERVAL_MS = 2000;
const COMPLETION_MESSAGE_MS = 2000;

export function useScrape(onComplete) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const completionTimeoutRef = useRef(null);

  const clearPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const clearCompletionTimeout = useCallback(() => {
    if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
    completionTimeoutRef.current = null;
  }, []);

  const pollStatus = useCallback((jobId, websiteId) => {
    clearPolling();
    pollRef.current = setInterval(async () => {
      try {
        const scrapeStatus = await getScrapeStatus(jobId);
        const percentage = scrapeStatus.progress_percent ?? 0;
        const pages = scrapeStatus.pages_scraped ?? scrapeStatus.pages_crawled ?? 0;
        setStatus(`Scraping… ${pages} pages (${percentage}%)`);

        if (scrapeStatus.status === 'completed') {
          clearPolling();
          setStatus(`✅ Done — ${pages} pages scraped. Embedding in background…`);
          setIsLoading(false);
          clearCompletionTimeout();
          completionTimeoutRef.current = setTimeout(() => {
            setStatus(null);
            setUrl('');
            onComplete(websiteId);
          }, COMPLETION_MESSAGE_MS);
        } else if (scrapeStatus.status === 'failed') {
          clearPolling();
          setError(`Scrape failed: ${scrapeStatus.error_message ?? 'unknown error'}`);
          setStatus(null);
          setIsLoading(false);
        }
      } catch {
        // Status polling can fail transiently while the backend continues the job.
      }
    }, POLL_INTERVAL_MS);
  }, [clearCompletionTimeout, clearPolling, onComplete]);

  const scrape = useCallback(async (event) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setError(null);
    setIsLoading(true);
    setStatus('Queueing scrape job…');

    try {
      const data = await startScrape(trimmedUrl);
      pollStatus(data.jobId, data.websiteId);
    } catch (requestError) {
      setError(
        requestError.message.includes('already been scraped')
          ? 'This website is already scraped. Select it from the sidebar.'
          : requestError.message,
      );
      setIsLoading(false);
      setStatus(null);
    }
  }, [pollStatus, url]);

  useEffect(() => () => {
    clearPolling();
    clearCompletionTimeout();
  }, [clearCompletionTimeout, clearPolling]);

  return { url, setUrl, isLoading, status, error, scrape };
}
