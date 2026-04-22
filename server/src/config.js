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

  db: {
    connectionString: required('DATABASE_URL'),
    caPath: process.env.DB_CA_PATH || '',
  },

  jwt: {
    secret: required('JWT_SECRET'),
    ttlSec: Number(process.env.JWT_TTL_SECONDS || 7 * 24 * 3600),
  },

  uploads: {
    dir: process.env.UPLOADS_DIR || './uploads',
    maxBytes: (Number(process.env.MAX_UPLOAD_MB || 5)) * 1024 * 1024,
  },

  corsOrigin: process.env.CORS_ORIGIN || '',
};

export const isProd = config.env === 'production';
