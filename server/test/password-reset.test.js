'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { test } = require('node:test');
const {
  buildPasswordResetLink,
  createPasswordResetRouter,
  hashResetEmail,
  hashResetToken,
  isValidResetToken
} = require('../src/password-reset');
const { decryptResetOutboxPayload } = require('../src/password-reset-crypto');
const { processPasswordResetOutbox } = require('../src/process-password-reset-outbox');

const OUTBOX_KEY = 'test-only-password-reset-outbox-key-32-bytes-minimum';

function createFakeDatabase() {
  const user = {
    id: 7,
    user_name: 'nilesh',
    email: 'nilesh@apollo-freight.com',
    account_status: 'Active',
    password: 'old-hash',
    auth_session_version: 0
  };
  const tokens = [];
  const outbox = [];

  function normalize(sql) {
    return String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  const clientQuery = async (sql, params = []) => {
    const statement = normalize(sql);
    if (['begin', 'commit', 'rollback'].includes(statement)) return { rows: [] };

    if (statement.startsWith('select id, token_hash, payload_ciphertext')) {
      const rows = outbox
        .filter((row) => !row.sent_at && !row.cancelled_at && row.expires_at > Date.now() && row.available_at <= Date.now() && (!row.locked_until || row.locked_until < Date.now()))
        .sort((a, b) => a.created_at - b.created_at)
        .slice(0, Number(params[0]))
        .map((row) => ({ ...row }));
      return { rows };
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set locked_until = now()')) {
      const row = outbox.find((item) => item.id === Number(params[0]));
      if (row) {
        row.locked_until = Date.now() + Number(params[1]) * 60 * 1000;
        row.attempts += 1;
      }
      return { rows: [] };
    }
    if (statement.startsWith('select id, email, account_status from app_users')) {
      return { rows: user.id === Number(params[0]) ? [{ ...user }] : [] };
    }
    if (statement.startsWith('select count(*)::int as total')) {
      const recent = tokens.filter((token) => token.user_id === Number(params[0]) && Date.now() - token.created_at < 15 * 60 * 1000);
      return { rows: [{ total: recent.length }] };
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set cancelled_at = now()')) {
      const userTokenHashes = new Set(tokens.filter((token) => token.user_id === Number(params[0]) && !token.used_at).map((token) => token.token_hash));
      for (const row of outbox) {
        if (userTokenHashes.has(row.token_hash) && !row.sent_at && !row.cancelled_at) {
          row.cancelled_at = Date.now();
          row.locked_until = null;
          row.payload_ciphertext = null;
          row.payload_nonce = null;
          row.payload_auth_tag = null;
        }
      }
      return { rows: [] };
    }
    if (statement.startsWith('update app_password_reset_tokens set used_at = now() where user_id = $1')) {
      for (const token of tokens) if (token.user_id === Number(params[0]) && !token.used_at) token.used_at = Date.now();
      return { rows: [] };
    }
    if (statement.startsWith('insert into app_password_reset_tokens')) {
      tokens.push({
        user_id: Number(params[0]),
        email_at_request_hash: String(params[1]),
        token_hash: String(params[2]),
        created_at: Date.now(),
        expires_at: Date.now() + Number(params[3]),
        used_at: null
      });
      return { rows: [] };
    }
    if (statement.startsWith('insert into app_password_reset_mail_outbox')) {
      outbox.push({
        id: outbox.length + 1,
        token_hash: String(params[0]),
        payload_ciphertext: Buffer.from(params[1]),
        payload_nonce: Buffer.from(params[2]),
        payload_auth_tag: Buffer.from(params[3]),
        expires_at: Date.now() + Number(params[4]),
        created_at: Date.now(),
        available_at: Date.now(),
        locked_until: null,
        attempts: 0,
        sent_at: null,
        cancelled_at: null
      });
      return { rows: [] };
    }
    if (statement.startsWith('select t.user_id, t.email_at_request_hash, u.user_name, u.email')) {
      const token = tokens.find((item) => item.token_hash === String(params[0]) && !item.used_at && item.expires_at > Date.now());
      const valid = token && user.account_status === 'Active';
      return { rows: valid ? [{ user_id: user.id, email_at_request_hash: token.email_at_request_hash, user_name: user.user_name, email: user.email }] : [] };
    }
    if (statement.startsWith('update app_users set password = $1')) {
      user.password = String(params[0]);
      user.auth_session_version += 1;
      return { rows: [] };
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set sent_at = now()')) {
      const row = outbox.find((item) => item.id === Number(params[0]) && !item.sent_at);
      if (row) {
        row.sent_at = Date.now();
        row.locked_until = null;
        row.payload_ciphertext = null;
        row.payload_nonce = null;
        row.payload_auth_tag = null;
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected fake client query: ${statement}`);
  };

  const query = async (sql, params = []) => {
    const statement = normalize(sql);
    if (statement.startsWith('select auth_session_version from app_users limit 0') ||
        statement.startsWith('select token_hash from app_password_reset_tokens limit 0') ||
        statement.startsWith('select token_hash from app_password_reset_mail_outbox limit 0')) {
      return { rows: [] };
    }
    if (statement.startsWith('select id, email from app_users')) {
      const email = String(params[0]).toLowerCase();
      return { rows: user.email.toLowerCase() === email && user.account_status === 'Active' ? [{ id: user.id, email: user.email }] : [] };
    }
    if (statement.startsWith('select t.email_at_request_hash, u.email, u.account_status')) {
      const token = tokens.find((item) => item.token_hash === String(params[0]) && !item.used_at && item.expires_at > Date.now());
      return { rows: token ? [{ email_at_request_hash: token.email_at_request_hash, email: user.email, account_status: user.account_status }] : [] };
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set sent_at = now()')) {
      return clientQuery(sql, params);
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set locked_until = null')) {
      return { rows: [] };
    }
    if (statement.startsWith('update app_password_reset_mail_outbox set cancelled_at = coalesce')) {
      return { rows: [] };
    }
    if (statement.startsWith('delete from app_password_reset_tokens')) return { rows: [] };
    throw new Error(`Unexpected fake query: ${statement}`);
  };

  const pool = { connect: async () => ({ query: clientQuery, release() {} }) };
  return { user, tokens, outbox, query, getPool: () => pool };
}

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function createApp(database, options = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api/password-reset', createPasswordResetRouter({
    ...database,
    outboxEncryptionKey: OUTBOX_KEY,
    enabled: options.enabled ?? true,
    hashPassword: (password) => `test-pbkdf2-hash:${password}`,
    rateLimiter: () => (_request, _response, next) => next(),
    env: { APP_PUBLIC_URL: 'https://portal.example.test', NODE_ENV: 'test' },
    minimumRequestResponseMs: 0
  }));
  return app;
}

test('reset requests queue encrypted mail, rotate one-time tokens, deliver via worker, and revoke sessions', async () => {
  const database = createFakeDatabase();
  const app = createApp(database);
  const sent = [];

  await withServer(app, async (baseUrl) => {
    const post = async (path, payload) => {
      const response = await fetch(`${baseUrl}/api/password-reset/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return { status: response.status, body: await response.json() };
    };

    const first = await post('request', { email: 'NILESH@APOLLO-FREIGHT.COM' });
    assert.equal(first.status, 200);
    assert.match(first.body.message, /If an active Apollo Connected account/);
    assert.equal(database.outbox.length, 1);
    assert.equal(database.outbox[0].sent_at, null);
    const firstPayload = decryptResetOutboxPayload({
      ciphertext: database.outbox[0].payload_ciphertext,
      nonce: database.outbox[0].payload_nonce,
      authTag: database.outbox[0].payload_auth_tag
    }, OUTBOX_KEY);
    assert.equal(database.tokens[0].email_at_request_hash, hashResetEmail('nilesh@apollo-freight.com'));
    assert.notEqual(database.tokens[0].email_at_request_hash, 'nilesh@apollo-freight.com');
    const firstToken = firstPayload.token;
    assert.equal(firstPayload.email, 'nilesh@apollo-freight.com');
    assert.ok(isValidResetToken(firstToken));
    assert.notEqual(database.outbox[0].token_hash, firstToken);
    assert.equal(database.outbox[0].token_hash, hashResetToken(firstToken));
    assert.equal(sent.length, 0, 'the API request never sends mail inline');

    const second = await post('request', { email: 'nilesh@apollo-freight.com' });
    assert.equal(second.status, 200);
    assert.equal(second.body.message, first.body.message);
    assert.equal(database.outbox.length, 2);
    assert.ok(database.tokens[0].used_at, 'issuing a new link invalidates the earlier link');
    assert.ok(database.outbox[0].cancelled_at, 'an unsent stale message is cancelled');
    assert.equal(database.outbox[0].payload_ciphertext, null, 'cancelled encrypted mail payload is erased');

    const unknown = await post('request', { email: 'not-registered@example.test' });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.message, first.body.message);
    assert.equal(database.outbox.length, 2, 'unknown addresses do not create queue entries');

    const workerResult = await processPasswordResetOutbox({
      query: database.query,
      getPool: database.getPool,
      sendMail: async (message) => { sent.push(message); },
      outboxKey: OUTBOX_KEY,
      env: { PASSWORD_RESET_ENABLED: 'true', APP_PUBLIC_URL: 'https://portal.example.test', NODE_ENV: 'test' }
    });
    assert.equal(workerResult.claimed, 1);
    assert.equal(workerResult.sent, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'nilesh@apollo-freight.com');

    const resetLink = sent[0].html.match(/<a href="([^"]+)" style="display:inline-block/)[1];
    const resetUrl = new URL(resetLink);
    const token = new URLSearchParams(resetUrl.hash.slice(1)).get('resetToken');
    assert.equal(resetUrl.origin, 'https://portal.example.test');
    assert.ok(isValidResetToken(token));
    assert.equal(hashResetToken(token), database.outbox[1].token_hash);
    assert.equal(database.outbox[1].payload_ciphertext, null, 'successful delivery erases the encrypted payload');

    const completed = await post('complete', { token, newPassword: 'NewPassword-For-Apollo-2030' });
    assert.equal(completed.status, 200);
    assert.equal(database.user.password, 'test-pbkdf2-hash:NewPassword-For-Apollo-2030');
    assert.equal(database.user.auth_session_version, 1, 'password reset invalidates existing bearer sessions');
    assert.ok(database.tokens.every((record) => record.used_at), 'completion invalidates every outstanding reset link');

    const reused = await post('complete', { token, newPassword: 'AnotherPassword-For-Apollo-2030' });
    assert.equal(reused.status, 400);
    assert.equal(database.user.password, 'test-pbkdf2-hash:NewPassword-For-Apollo-2030');
  });
});

test('password reset stays disabled unless explicitly enabled', async () => {
  const database = createFakeDatabase();
  const app = createApp(database, { enabled: false });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/password-reset/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nilesh@apollo-freight.com' })
    });
    assert.equal(response.status, 503);
    assert.equal(database.outbox.length, 0);
  });
});

test('reset link requires HTTPS in production and keeps its token in the fragment', () => {
  const token = Buffer.alloc(32, 9).toString('base64url');
  const url = new URL(buildPasswordResetLink(token, { APP_PUBLIC_URL: 'https://connected.apollo-freight.com/path', NODE_ENV: 'production' }));
  assert.equal(url.protocol, 'https:');
  assert.equal(url.pathname, '/');
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('resetToken'), token);
  assert.throws(() => buildPasswordResetLink(token, { APP_PUBLIC_URL: 'http://localhost:3000', NODE_ENV: 'production' }), /HTTPS/);
});
