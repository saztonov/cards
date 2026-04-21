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

// 3 регистрации / минуту / IP
export const registerIpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_registrations_ip' },
});

// 30 регистраций / час — глобальный лимит на весь сайт
export const registerGlobalLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global',
  message: { error: 'too_many_registrations_global' },
});
