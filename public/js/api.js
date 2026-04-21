const BASE = (window.__CARDS_CONFIG__?.API_URL || '').replace(/\/$/, '');

let accessToken = null;
let refreshInFlight = null;

export function getAccess() { return accessToken; }
export function setAccess(token) { accessToken = token; }
export function clearAccess() { accessToken = null; }

async function refreshAccess() {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) throw new Error('refresh_failed');
      const data = await r.json();
      accessToken = data.access;
      return accessToken;
    }).finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function api(path, { method = 'GET', body, headers = {}, formData } = {}) {
  const doRequest = async () => {
    const init = {
      method,
      headers: { ...headers },
      credentials: 'include',
    };
    if (accessToken) init.headers.Authorization = `Bearer ${accessToken}`;
    if (formData) {
      init.body = formData;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return fetch(`${BASE}${path}`, init);
  };

  let res = await doRequest();
  if (res.status === 401 && accessToken !== null) {
    try {
      await refreshAccess();
      res = await doRequest();
    } catch {
      accessToken = null;
    }
  }
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

// Попробовать поднять access по refresh-cookie при загрузке страницы.
// Возвращает true, если пользователь залогинен.
export async function tryRestoreSession() {
  try {
    await refreshAccess();
    return true;
  } catch {
    return false;
  }
}
