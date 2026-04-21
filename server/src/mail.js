import nodemailer from 'nodemailer';
import { config } from './config.js';

const hasSmtp = Boolean(config.smtp.host && config.smtp.user);

const transport = hasSmtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.password },
    })
  : null;

export async function sendMail({ to, subject, text, html }) {
  if (!transport) {
    console.log('[mail:dev]', { to, subject, text });
    return;
  }
  await transport.sendMail({ from: config.smtp.from, to, subject, text, html });
}

export function buildVerifyLink(token) {
  return `${config.appUrl.replace(/\/$/, '')}/api/v1/auth/verify/${token}`;
}
export function buildResetLink(token) {
  return `${config.appUrl.replace(/\/$/, '')}/reset?token=${token}`;
}
