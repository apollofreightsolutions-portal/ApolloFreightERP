'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequireCustomerPortalAuth, passwordVersion } = require('../src/customer-token-auth');

const passwordHash = '$2b$12$stable-hash-value-for-customer';
const session = {
  customerUserId: '17',
  customerCode: 'CUS-017',
  userName: 'customer.user',
  portal: 'customer',
  passwordVersion: passwordVersion(passwordHash)
};
const account = {
  id: 17,
  customer_code: 'CUS-017',
  username: 'customer.user',
  email: 'user@example.test',
  password_hash: passwordHash,
  status: 'ACTIVE',
  customer_name: 'Current Customer Name',
  customer_branch: 'Kuwait HO',
  customer_status: 'Active'
};

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

async function runAuth({ tokenSession = session, row = account, error, headers = { authorization: 'Bearer signed-token' } } = {}) {
  let nextCalls = 0;
  let queryCalls = 0;
  let forwardedError;
  const middleware = createRequireCustomerPortalAuth({
    verifyToken: (token) => token === 'signed-token' ? tokenSession : null,
    query: async () => {
      queryCalls += 1;
      if (error) throw error;
      return { rows: row ? [row] : [] };
    }
  });
  const request = { headers };
  const response = makeResponse();
  await middleware(request, response, (nextError) => {
    nextCalls += 1;
    forwardedError = nextError;
  });
  return { request, response, nextCalls, queryCalls, forwardedError };
}

test('active customer tokens use the current password fingerprint and enrich current account data', async () => {
  const result = await runAuth();
  assert.equal(result.nextCalls, 1);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.queryCalls, 1);
  assert.match(result.request.customerSession.customerUserId, /17/);
  assert.equal(result.request.customerSession.customerName, 'Current Customer Name');
  assert.equal(result.request.customerSession.customerCode, 'CUS-017');
});

test('non-customer portal tokens are rejected before database access', async () => {
  const result = await runAuth({ tokenSession: { ...session, portal: 'app' } });
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.queryCalls, 0);
});

test('password changes, disabled accounts, and changed login identity revoke old tokens', async () => {
  for (const row of [
    { ...account, status: 'Inactive' },
    { ...account, customer_status: 'Inactive' },
    { ...account, password_hash: '$2b$12$new-password-hash' },
    { ...account, customer_code: 'CUS-OTHER' },
    { ...account, username: 'renamed.user' },
    null
  ]) {
    const result = await runAuth({ row });
    assert.equal(result.response.statusCode, 401);
    assert.equal(result.nextCalls, 0);
  }
});

test('normal last-login and customer-profile changes do not invalidate an unchanged password token', async () => {
  const result = await runAuth({
    row: { ...account, customer_name: 'Renamed Customer', customer_branch: 'Dubai' }
  });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.nextCalls, 1);
  assert.equal(result.request.customerSession.customerName, 'Renamed Customer');
  assert.equal(result.request.customerSession.branchAccess, 'Dubai');
});

test('database errors fail closed with a temporary authentication error', async () => {
  const result = await runAuth({ error: new Error('database unavailable') });
  assert.equal(result.response.statusCode, 503);
  assert.equal(result.response.payload.ok, false);
  assert.equal(result.nextCalls, 0);
});
