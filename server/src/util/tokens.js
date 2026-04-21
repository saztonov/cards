import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, slug: user.slug, role: user.role || 'user' },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.ttlSec }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
}

export function slugify(input) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || crypto.randomBytes(4).toString('hex');
}
