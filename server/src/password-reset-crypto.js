'use strict';

const crypto = require('crypto');

const OUTBOX_AAD = Buffer.from('apollo-connected-password-reset-outbox-v1', 'utf8');

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function hashResetEmail(email) {
  return crypto.createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}

function isValidResetToken(token) {
  const value = String(token || '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function buildPasswordResetLink(token, env = process.env) {
  const configuredUrl = String(env.APP_PUBLIC_URL || 'https://connected.apollo-freight.com').trim();
  const url = new URL(configuredUrl);
  if (url.username || url.password || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('The public portal URL is not valid.');
  }
  if (String(env.NODE_ENV || '').toLowerCase() === 'production' && url.protocol !== 'https:') {
    throw new Error('The public portal URL must use HTTPS in production.');
  }
  url.pathname = '/';
  url.search = '';
  // Fragments are not included in HTTP requests or Referer headers. The login page clears the
  // fragment before posting the token to the API.
  url.hash = new URLSearchParams({ resetToken: String(token) }).toString();
  return url.href;
}

function deriveOutboxKey(secret) {
  const source = String(secret || '');
  if (Buffer.byteLength(source, 'utf8') < 32) {
    throw new Error('PASSWORD_RESET_OUTBOX_KEY must contain at least 32 bytes.');
  }
  return crypto.createHmac('sha256', source).update(OUTBOX_AAD).digest();
}

function encryptResetOutboxPayload(payload, secret) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveOutboxKey(secret), nonce);
  cipher.setAAD(OUTBOX_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ]);
  return { ciphertext, nonce, authTag: cipher.getAuthTag() };
}

function decryptResetOutboxPayload({ ciphertext, nonce, authTag }, secret) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveOutboxKey(secret), Buffer.from(nonce));
  decipher.setAAD(OUTBOX_AAD);
  decipher.setAuthTag(Buffer.from(authTag));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertext)),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

module.exports = {
  buildPasswordResetLink,
  decryptResetOutboxPayload,
  encryptResetOutboxPayload,
  hashResetEmail,
  hashResetToken,
  isValidResetToken
};
