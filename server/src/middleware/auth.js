import { verifyToken } from '../util/tokens.js';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const payload = verifyToken(token);
    req.user = {
      id: payload.sub,
      slug: payload.slug,
      role: payload.role || 'user',
    };
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden' });
  }
  next();
}
