'use strict';

const crypto = require('crypto');
const express = require('express');
const { processPasswordResetOutbox } = require('./process-password-reset-outbox');
const {
  buildPasswordResetLink,
  encryptResetOutboxPayload,
  hashResetEmail,
  hashResetToken,
  isValidResetToken
} = require('./password-reset-crypto');

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_MAX_REQUESTS_PER_USER = 3;
const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;
const GENERIC_REQUEST_MESSAGE = 'If an active Apollo Connected account is associated with that email, a reset link will be sent shortly. Check your inbox in a minute or two.';
const UNAVAILABLE_MESSAGE = 'Password reset is temporarily unavailable. Please try again later or contact your Apollo administrator.';
const INVALID_TOKEN_MESSAGE = 'This reset link is invalid, expired, or already used. Request a new link.';

function isValidEmailAddress(email) {
  return Boolean(email && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function createPasswordResetRouter({
  query,
  getPool,
  hashPassword,
  rateLimiter,
  outboxEncryptionKey = process.env.PASSWORD_RESET_OUTBOX_KEY,
  enabled = String(process.env.PASSWORD_RESET_ENABLED || '').toLowerCase() === 'true',
  minimumRequestResponseMs = 250,
  processOutbox = processPasswordResetOutbox,
  sendMail,
  env = process.env
}) {
  if (![query, getPool, hashPassword, rateLimiter, processOutbox].every((value) => typeof value === 'function')) {
    throw new TypeError('Password reset router dependencies are required.');
  }

  const router = express.Router();
  const requestLimiter = rateLimiter({
    windowMs: PASSWORD_RESET_WINDOW_MS,
    max: 10,
    keyFor: (request) => `password-reset-request:${request.ip || 'unknown'}`
  });
  const completionLimiter = rateLimiter({
    windowMs: PASSWORD_RESET_WINDOW_MS,
    max: 15,
    keyFor: (request) => `password-reset-complete:${request.ip || 'unknown'}`
  });

  async function requestResponse(response, startedAt, status, body) {
    const targetDelay = Math.max(0, Number(minimumRequestResponseMs) || 0);
    await wait(targetDelay - (Date.now() - startedAt));
    return response.status(status).json(body);
  }

  router.post('/request', requestLimiter, async (request, response) => {
    const startedAt = Date.now();
    const email = String(request.body?.email || '').trim().toLowerCase();
    if (!isValidEmailAddress(email)) {
      return response.json({ ok: true, message: GENERIC_REQUEST_MESSAGE });
    }
    if (!enabled || Buffer.byteLength(String(outboxEncryptionKey || ''), 'utf8') < 32) {
      return requestResponse(response, startedAt, 503, { ok: false, error: UNAVAILABLE_MESSAGE });
    }

    // Check every required column/table before looking up the address. If migration 049 is
    // missing, all syntactically valid addresses receive the same status and response.
    try {
      await query('select auth_session_version from app_users limit 0');
      await query('select token_hash from app_password_reset_tokens limit 0');
      await query('select token_hash from app_password_reset_mail_outbox limit 0');
    } catch (_error) {
      return requestResponse(response, startedAt, 503, { ok: false, error: UNAVAILABLE_MESSAGE });
    }

    let matches;
    try {
      matches = await query(
        `select id, email
         from app_users
         where lower(btrim(email)) = $1
           and lower(btrim(coalesce(account_status, 'Active'))) = 'active'
         limit 2`,
        [email]
      );
    } catch (_error) {
      // After successful schema preflight, use the same public response as an unknown address.
      console.error('Password-reset request lookup failed after schema preflight.');
      return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
    }

    // Do not reveal whether an email is registered or select among duplicate accounts.
    if (matches.rows.length !== 1) {
      return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
    }

    const userId = matches.rows[0].id;
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(token);
    const encryptedPayload = encryptResetOutboxPayload({ email, token }, outboxEncryptionKey);
    let client;
    try {
      client = await getPool().connect();
      await client.query('begin');
      const lockedUser = (await client.query(
        `select id, email, account_status
         from app_users
         where id = $1
         for update`,
        [userId]
      )).rows[0];
      if (!lockedUser || String(lockedUser.account_status || 'Active').trim().toLowerCase() !== 'active' ||
          String(lockedUser.email || '').trim().toLowerCase() !== email) {
        await client.query('rollback');
        return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
      }

      const recent = await client.query(
        `select count(*)::int as total
         from app_password_reset_tokens
         where user_id = $1 and created_at > now() - interval '15 minutes'`,
        [userId]
      );
      if (Number(recent.rows[0]?.total || 0) >= PASSWORD_RESET_MAX_REQUESTS_PER_USER) {
        await client.query('rollback');
        return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
      }

      // A newer link invalidates older links and removes their unsent encrypted emails.
      await client.query(
        `update app_password_reset_mail_outbox
         set cancelled_at = now(), locked_until = null,
             payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null
         where token_hash in (
           select token_hash from app_password_reset_tokens where user_id = $1 and used_at is null
         ) and sent_at is null and cancelled_at is null`,
        [userId]
      );
      await client.query(
        `update app_password_reset_tokens
         set used_at = now()
         where user_id = $1 and used_at is null`,
        [userId]
      );
      await client.query(
        `insert into app_password_reset_tokens (user_id, email_at_request_hash, token_hash, expires_at)
         values ($1, $2, $3, now() + ($4::bigint * interval '1 millisecond'))`,
        [userId, hashResetEmail(email), tokenHash, PASSWORD_RESET_TTL_MS]
      );
      await client.query(
        `insert into app_password_reset_mail_outbox
           (token_hash, payload_ciphertext, payload_nonce, payload_auth_tag, expires_at)
         values ($1, $2, $3, $4, now() + ($5::bigint * interval '1 millisecond'))`,
        [tokenHash, encryptedPayload.ciphertext, encryptedPayload.nonce, encryptedPayload.authTag, PASSWORD_RESET_TTL_MS]
      );
      await client.query('commit');
    } catch (_error) {
      if (client) await client.query('rollback').catch(() => {});
      // Do not distinguish a failed insert for a known address from an unknown address.
      console.error('Password-reset request could not be queued after schema preflight.');
      return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
    } finally {
      client?.release();
    }

    // Deliver this request's email immediately after its durable outbox row commits. The
    // scheduled worker remains optional for backlog cleanup; delivery no longer depends on
    // a minute-by-minute Scheduler execution.
    try {
      await processOutbox({
        query,
        getPool,
        sendMail,
        outboxKey: outboxEncryptionKey,
        env,
        tokenHash
      });
    } catch (_error) {
      // Keep the public response generic and never log reset tokens, addresses, or provider data.
      console.error('Immediate password-reset email delivery could not be completed.');
    }

    return requestResponse(response, startedAt, 200, { ok: true, message: GENERIC_REQUEST_MESSAGE });
  });

  router.post('/complete', completionLimiter, async (request, response) => {
    if (!enabled) return response.status(503).json({ ok: false, error: UNAVAILABLE_MESSAGE });
    const token = String(request.body?.token || '').trim();
    const newPassword = String(request.body?.newPassword || '');
    if (!isValidResetToken(token)) return response.status(400).json({ ok: false, error: INVALID_TOKEN_MESSAGE });
    if (newPassword.length < 12 || newPassword.length > 128) {
      return response.status(400).json({ ok: false, error: 'Choose a password between 12 and 128 characters.' });
    }

    const tokenHash = hashResetToken(token);
    let client;
    try {
      client = await getPool().connect();
    } catch (_error) {
      return response.status(503).json({ ok: false, error: UNAVAILABLE_MESSAGE });
    }

    try {
      await client.query('begin');
      const result = await client.query(
        `select t.user_id, t.email_at_request_hash, u.user_name, u.email
         from app_password_reset_tokens t
         join app_users u on u.id = t.user_id
         where t.token_hash = $1
           and t.used_at is null
           and t.expires_at > now()
           and lower(btrim(coalesce(u.account_status, 'Active'))) = 'active'
         for update of t, u`,
        [tokenHash]
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('rollback');
        return response.status(400).json({ ok: false, error: INVALID_TOKEN_MESSAGE });
      }
      if (hashResetEmail(row.email) !== row.email_at_request_hash) {
        await client.query('rollback');
        return response.status(400).json({ ok: false, error: INVALID_TOKEN_MESSAGE });
      }

      const passwordHash = hashPassword(newPassword);
      await client.query(
        `update app_users
         set password = $1, auth_session_version = coalesce(auth_session_version, 0) + 1, updated_at = now()
         where id = $2`,
        [passwordHash, row.user_id]
      );
      await client.query(
        `update app_password_reset_mail_outbox
         set cancelled_at = now(), locked_until = null,
             payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null
         where token_hash in (
           select token_hash from app_password_reset_tokens where user_id = $1 and used_at is null
         ) and sent_at is null and cancelled_at is null`,
        [row.user_id]
      );
      await client.query(
        `update app_password_reset_tokens
         set used_at = now()
         where user_id = $1 and used_at is null`,
        [row.user_id]
      );
      await client.query('commit');
      return response.json({ ok: true, message: 'Password reset successfully. Other active sessions have been signed out; sign in with your new password.' });
    } catch (_error) {
      await client.query('rollback').catch(() => {});
      return response.status(503).json({ ok: false, error: UNAVAILABLE_MESSAGE });
    } finally {
      client.release();
    }
  });

  return router;
}

module.exports = {
  buildPasswordResetLink,
  createPasswordResetRouter,
  hashResetToken,
  isValidResetToken,
  isValidEmailAddress,
  hashResetEmail,
  PASSWORD_RESET_TTL_MS,
  GENERIC_REQUEST_MESSAGE
};
