import rateLimit from 'express-rate-limit';

// 5 неудачных попыток / 15 мин / IP
export const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'too_many_attempts' },
});

// 10 неудачных / час / email (ключ — нормализованный email из body)
export const loginEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => (req.body?.email || '').toLowerCase().trim() || req.ip,
  message: { error: 'too_many_attempts' },
});

// Мягкий лимит на регистрацию/reset, чтобы не спамили email-ом
export const authSoftLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
