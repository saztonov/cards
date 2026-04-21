const THEMES = new Set(['modern', 'legacy']);
const STORAGE_KEY = 'cards.theme';

function pickTheme() {
  const urlParam = new URLSearchParams(location.search).get('theme');
  if (urlParam && THEMES.has(urlParam)) {
    localStorage.setItem(STORAGE_KEY, urlParam);
    return urlParam;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.has(stored)) return stored;
  const defaultFromServer = document.documentElement.dataset.defaultTheme;
  if (defaultFromServer && THEMES.has(defaultFromServer)) return defaultFromServer;
  return 'modern';
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
}

export function initTheme() {
  apply(pickTheme());
}

export function setTheme(theme) {
  if (!THEMES.has(theme)) return;
  localStorage.setItem(STORAGE_KEY, theme);
  apply(theme);
}

export function currentTheme() {
  return document.documentElement.dataset.theme || 'modern';
}
