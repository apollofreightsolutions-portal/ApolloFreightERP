'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequireCustomerPortalAuth } = require('../src/customer-token-auth');

const userUpdatedAt = new Date('2026-11-02T10:00:00.000Z');
const customerUpdatedAt = new Date('2026-11-02T10:01:00.000Z');
const session = {
  customerUserId: '17',
  customerCode: 'CUS-017',
  userName: 'customer.user',
  portal: 'customer',
  customerUserUpdatedAt: userUpdatedAt.getTime(),
  customerUpdatedAt: customerUpdatedAt.getTime()
};
const account = {
  id: 17,
  customer_code: 'CUS-017',
  username: 'customer.user',
  email: 'user@example.test',
  status: 'ACTIVE',
  customer_user_updated_at: userUpdatedAt,
  customer_name: 'Current Customer Name',
  customer_branch: 'Kuwait HO',
  customer_status: 'Active',
  customer_updated_at: customerUpdatedAt
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

test('active customer tokens are checked against current customer rows and enriched with current account data', async () => {
  const result = await runAuth();
  assert.equal(result.nextCalls, 1);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.queryCalls, 1);
  assert.equal(result.request.customerSession.customerName, 'Current Customer Name');
  assert.equal(result.request.customerSession.customerCode, 'CUS-017');
});

test('non-customer portal tokens are rejected before database access', async () => {
  const result = await runAuth({ tokenSession: { ...session, portal: 'app' } });
  assert.equal(result.response.statusCode, 401);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.queryCalls, 0);
});

test('inactive customer users, inactive linked customers, and stale account state are rejected', async () => {
  for (const row of [
    { ...account, status: 'Inactive' },
    { ...account, customer_status: 'Inactive' },
    { ...account, customer_user_updated_at: new Date(userUpdatedAt.getTime() + 1) },
    { ...account, customer_updated_at: new Date(customerUpdatedAt.getTime() + 1) },
    { ...account, customer_code: 'CUS-OTHER' },
    { ...account, username: 'renamed.user' },
    null
  ]) {
    const result = await runAuth({ row });
    assert.equal(result.response.statusCode, 401);
    assert.equal(result.nextCalls, 0);
  }
});

test('database errors fail closed with a temporary authentication error', async () => {
  const result = await runAuth({ error: new Error('database unavailable') });
  assert.equal(result.response.statusCode, 503);
  assert.equal(result.response.payload.ok, false);
  assert.equal(result.nextCalls, 0);
});
