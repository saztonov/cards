import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config, isProd } from './config.js';
import { securityHeaders } from './middleware/security-headers.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import cardsRoutes from './routes/cards.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());

// В dev фронт на отдельном порту → разрешаем CORS на указанный origin.
if (!isProd && config.corsOrigin) {
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).end();
    }
    next();
  });
}

app.get('/api/v1/health', (_req, res) => res.json({ ok: true, theme: config.defaultTheme }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/me', meRoutes);
app.use('/api/v1/cards', cardsRoutes);

// Раздача загруженных файлов — в продe эту задачу берёт nginx (location /uploads/).
app.use('/uploads', express.static(path.resolve(config.uploads.dir)));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'server_error' });
});

app.listen(config.port, () => {
  console.log(`cards-api listening on :${config.port} (${config.env})`);
});
