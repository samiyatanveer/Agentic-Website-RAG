import { apiGet, apiPost } from './api';

export function startScrape(url) {
  return apiPost('/scrape', { url });
}

export function getScrapeStatus(jobId) {
  return apiGet(`/scrape/${jobId}/status`);
}
