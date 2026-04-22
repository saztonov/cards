// Опционально. По умолчанию фронт определяет API URL автоматически:
// - в prod (same-origin) — пустой BASE, nginx проксирует /api/
// - в dev (статика на :8000 и т.п.) — http://<host>:3005
//
// Если хочется указать API вручную — скопируй этот файл в config.js
// и добавь <script src="/config.js"></script> в <head> нужных HTML-страниц.
window.__CARDS_CONFIG__ = {
  API_URL: 'http://localhost:3005',
};
