import { apiDelete, apiGet, apiPost } from './api';

export async function getWebsites() {
  const data = await apiGet('/websites');
  return data.websites ?? [];
}

export function rescrapeWebsite(id) {
  return apiPost(`/websites/${id}/rescrape`, {});
}

export function deleteWebsite(id) {
  return apiDelete(`/websites/${id}`);
}
