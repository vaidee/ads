import { getIdToken, refresh } from './auth';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function buildUrl(path, query) {
  const url = new URL(API_BASE + path);
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  return url;
}

async function doFetch(url, method, body, token) {
  return fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Every route is behind the Cognito JWT authorizer (SPEC.md section 6), so a
// single 401-retry-after-refresh here covers every call site.
async function request(method, path, { query, body } = {}) {
  const url = buildUrl(path, query);
  let res = await doFetch(url, method, body, getIdToken());

  if (res.status === 401) {
    const refreshed = await refresh();
    if (refreshed) res = await doFetch(url, method, body, refreshed.IdToken);
  }

  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = JSON.parse(text).error || text;
    } catch {
      // not JSON, use the raw text
    }
    throw new Error(message || `Request failed with status ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || '';
  return contentType.includes('application/json') ? res.json() : res.text();
}

export const api = {
  listAds: (params) => request('GET', '/ads', { query: params }),
  searchAds: (q) => request('GET', '/ads/search', { query: { q } }),
  getAd: (id) => request('GET', `/ads/${id}`),
  approve: (id, reason) => request('POST', `/ads/${id}/approve`, { body: { reason } }),
  reject: (id, reason) => request('POST', `/ads/${id}/reject`, { body: { reason } }),
  sendback: (id, reason) => request('POST', `/ads/${id}/sendback`, { body: { reason } }),
  reprocess: (id) => request('POST', `/ads/${id}/reprocess`),
  addComment: (id, commentText, findingId) =>
    request('POST', `/ads/${id}/comments`, { body: { comment_text: commentText, finding_id: findingId } }),
  publish: (id, platform) => request('POST', `/ads/${id}/publish`, { body: { platform } }),
  createUploadUrl: (filename, durationSeconds) =>
    request('POST', '/ads/upload-url', { body: { filename, duration_seconds: durationSeconds } }),
  weeklyEval: () => request('GET', '/eval/weekly'),

  // FR-13: same filters as listAds, but the browser needs the auth header on
  // the download too, so this can't just be a plain <a href> link.
  async exportCsv(params) {
    const url = buildUrl('/ads/export', params);
    const res = await doFetch(url, 'GET', undefined, getIdToken());
    if (!res.ok) throw new Error('Export failed');
    const blob = await res.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ads-export.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  },
};
