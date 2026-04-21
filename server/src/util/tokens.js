import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

export function signAccess(user) {
  return jwt.sign(
    { sub: user.id, slug: user.slug },
    config.jwt.secret,
    { algorithm: 'HS256', expiresIn: config.jwt.accessTtlSec }
  );
}

export function verifyAccess(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });
}

export function slugify(input) {
  const translit = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
  return translit || crypto.randomBytes(4).toString('hex');
}
