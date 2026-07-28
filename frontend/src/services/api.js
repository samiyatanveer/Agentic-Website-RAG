const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
const API_BASE_URL = configuredBaseUrl.replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const rawBody = await response.text();
  let payload = {};

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new ApiError(`Invalid response from server (HTTP ${response.status}).`, response.status);
  }

  if (!response.ok) {
    throw new ApiError(payload.error?.message || `HTTP ${response.status}`, response.status, payload);
  }

  return payload.data;
}

export function apiGet(path) {
  return request(path);
}

export function apiPost(path, body) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
