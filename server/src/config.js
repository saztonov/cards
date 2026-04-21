import 'dotenv/config';

const required = (key) => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3005),
  appUrl: required('APP_URL'),
  defaultTheme: process.env.DEFAULT_THEME || 'modern',

  db: { connectionString: required('DATABASE_URL') },

  jwt: {
    secret: required('JWT_SECRET'),
    accessTtlSec: Number(process.env.ACCESS_TTL_SECONDS || 900),
    refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  },

  uploads: {
    dir: process.env.UPLOADS_DIR || './uploads',
    maxBytes: (Number(process.env.MAX_UPLOAD_MB || 5)) * 1024 * 1024,
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || 'Cards <no-reply@cards.fvds.ru>',
  },

  corsOrigin: process.env.CORS_ORIGIN || '',
  cookieSecure: (process.env.COOKIE_SECURE || 'false') === 'true',
};

export const isProd = config.env === 'production';
