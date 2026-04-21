const BASE = (window.__CARDS_CONFIG__?.API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'cards.token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
export function hasToken() { return Boolean(getToken()); }

export async function api(path, { method = 'GET', body, headers = {}, formData } = {}) {
  const init = { method, headers: { ...headers } };
  const token = getToken();
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 401) clearToken();
  return res;
}

export async function apiJson(path, opts) {
  const res = await api(path, opts);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}
