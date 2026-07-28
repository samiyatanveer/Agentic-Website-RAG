import { apiGet } from './api';

export async function getWebsites() {
  const data = await apiGet('/websites');
  return data.websites ?? [];
}
