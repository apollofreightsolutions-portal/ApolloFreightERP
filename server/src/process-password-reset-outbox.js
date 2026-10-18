'use strict';

const { getPool, query, closePool } = require('./db');
const { sendMicrosoftGraphMail } = require('./microsoft-graph-mail');
const { emailAttachments } = require('./email-templates');
const { passwordResetEmailHtml, passwordResetEmailText } = require('./password-reset-email');
const {
  buildPasswordResetLink,
  decryptResetOutboxPayload,
  hashResetEmail,
  hashResetToken,
  isValidResetToken
} = require('./password-reset-crypto');

const MAX_BATCH = 10;
const MAX_ATTEMPTS = 5;
const LEASE_MINUTES = 5;

async function claimPendingOutboxRows(pool, limit = MAX_BATCH) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await client.query(
      `select id, token_hash, payload_ciphertext, payload_nonce, payload_auth_tag, attempts, expires_at
       from app_password_reset_mail_outbox
       where sent_at is null
         and cancelled_at is null
         and expires_at > now()
         and available_at <= now()
       and (locked_until is null or locked_until < now())
       order by created_at asc
       limit $1
       for update skip locked`,
      [Math.max(1, Math.min(MAX_BATCH, Number(limit) || MAX_BATCH))]
    );
    const rows = result.rows || [];
    for (const row of rows) {
      await client.query(
        `update app_password_reset_mail_outbox
         set locked_until = now() + ($2::int * interval '1 minute'), attempts = attempts + 1
         where id = $1`,
        [row.id, LEASE_MINUTES]
      );
      row.attempts = Number(row.attempts || 0) + 1;
    }
    await client.query('commit');
    return rows;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function cancelOutboxRow(queryFn, id) {
  await queryFn(
    `update app_password_reset_mail_outbox
     set cancelled_at = coalesce(cancelled_at, now()), locked_until = null,
         payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null
     where id = $1 and sent_at is null`,
    [id]
  );
}

async function processPasswordResetOutbox({
  query: queryFn = query,
  getPool: getPoolFn = getPool,
  sendMail = sendMicrosoftGraphMail,
  outboxKey = process.env.PASSWORD_RESET_OUTBOX_KEY,
  env = process.env,
  limit = MAX_BATCH,
  maxAttempts = MAX_ATTEMPTS
} = {}) {
  if (String(env.PASSWORD_RESET_ENABLED || '').toLowerCase() !== 'true') {
    return { claimed: 0, sent: 0, cancelled: 0, retried: 0, disabled: true };
  }
  if (Buffer.byteLength(String(outboxKey || ''), 'utf8') < 32) {
    throw new Error('PASSWORD_RESET_OUTBOX_KEY must contain at least 32 bytes.');
  }

  const rows = await claimPendingOutboxRows(getPoolFn(), limit);
  const summary = { claimed: rows.length, sent: 0, cancelled: 0, retried: 0, disabled: false };

  for (const row of rows) {
    try {
      const payload = decryptResetOutboxPayload({
        ciphertext: row.payload_ciphertext,
        nonce: row.payload_nonce,
        authTag: row.payload_auth_tag
      }, outboxKey);
      const token = String(payload?.token || '');
      const recipient = String(payload?.email || '').trim().toLowerCase();
      if (!isValidResetToken(token) || hashResetToken(token) !== row.token_hash || !recipient) {
        await cancelOutboxRow(queryFn, row.id);
        summary.cancelled += 1;
        continue;
      }

      const tokenResult = await queryFn(
        `select t.email_at_request_hash, u.email, u.account_status
         from app_password_reset_tokens t
         join app_users u on u.id = t.user_id
         where t.token_hash = $1 and t.used_at is null and t.expires_at > now()`,
        [row.token_hash]
      );
      const currentEmail = String(tokenResult.rows[0]?.email || '').trim().toLowerCase();
      const active = String(tokenResult.rows[0]?.account_status || 'Active').trim().toLowerCase() === 'active';
      if (!active || !currentEmail || currentEmail !== recipient ||
          hashResetEmail(currentEmail) !== tokenResult.rows[0]?.email_at_request_hash) {
        await cancelOutboxRow(queryFn, row.id);
        summary.cancelled += 1;
        continue;
      }

      const resetUrl = buildPasswordResetLink(token, env);
      await sendMail({
        to: recipient,
        subject: 'Reset your Apollo Connected password',
        html: passwordResetEmailHtml({ resetUrl, expiresMinutes: 30 }),
        text: passwordResetEmailText({ resetUrl, expiresMinutes: 30 }),
        attachments: emailAttachments()
      });
      await queryFn(
        `update app_password_reset_mail_outbox
         set sent_at = now(), locked_until = null,
             payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null
         where id = $1 and sent_at is null`,
        [row.id]
      );
      summary.sent += 1;
    } catch (_error) {
      // Do not log recipient addresses, reset tokens/URLs, ciphertext, or provider error payloads.
      if (Number(row.attempts || 0) >= maxAttempts || new Date(row.expires_at).getTime() <= Date.now()) {
        await cancelOutboxRow(queryFn, row.id).catch(() => {});
        summary.cancelled += 1;
        console.error('A password-reset email expired or exhausted retries; its queue entry was cancelled.');
        continue;
      }
      const delaySeconds = Math.min(30 * (2 ** Math.max(0, Number(row.attempts || 1) - 1)), 300);
      await queryFn(
        `update app_password_reset_mail_outbox
         set locked_until = null, available_at = now() + ($2::int * interval '1 second'),
             last_error = 'delivery_failed'
         where id = $1 and sent_at is null`,
        [row.id, delaySeconds]
      ).catch(() => {});
      summary.retried += 1;
      console.error('A password-reset email delivery attempt failed; it will be retried if the link remains valid.');
    }
  }

  await queryFn(
    `update app_password_reset_mail_outbox
     set cancelled_at = coalesce(cancelled_at, now()), locked_until = null,
         payload_ciphertext = null, payload_nonce = null, payload_auth_tag = null
     where sent_at is null and cancelled_at is null and expires_at <= now()`
  );
  await queryFn(
    `delete from app_password_reset_tokens
     where expires_at < now() - interval '7 days'`
  );
  return summary;
}

async function main() {
  if (String(process.env.PASSWORD_RESET_ENABLED || '').toLowerCase() !== 'true') {
    console.log('Password-reset outbox processing is disabled; no rows were read.');
    return;
  }
  const result = await processPasswordResetOutbox();
  console.log(`Password-reset outbox batch complete: claimed=${result.claimed}, sent=${result.sent}, cancelled=${result.cancelled}, retried=${result.retried}.`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
}

module.exports = { claimPendingOutboxRows, processPasswordResetOutbox };
