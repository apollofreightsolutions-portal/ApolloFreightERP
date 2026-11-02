'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRequireCurrentErpAdmin } = require('../src/current-admin-auth');

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

async function runMiddleware({ row, error, session = { userName: 'alice' } }) {
  let queryCall;
  let nextCalls = 0;
  let forwardedError;
  const middleware = createRequireCurrentErpAdmin(async (...args) => {
    queryCall = args;
    if (error) throw error;
    return { rows: row ? [row] : [] };
  });
  const response = makeResponse();
  await middleware({ appSession: session }, response, (nextError) => {
    nextCalls += 1;
    forwardedError = nextError;
  });
  return { response, queryCall, nextCalls, forwardedError };
}

test('current active ERP admin is allowed based on the database role', async () => {
  const result = await runMiddleware({ row: { role: ' Admin ', account_status: 'Active' } });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.response.statusCode, 200);
  assert.deepEqual(result.queryCall[1], ['alice']);
  assert.match(result.queryCall[0], /from app_users/i);
});

test('non-admin, inactive, and missing users are denied without continuing', async () => {
  for (const row of [
    { role: 'manager', account_status: 'Active' },
    { role: 'admin', account_status: 'Disabled' },
    null
  ]) {
    const result = await runMiddleware({ row });
    assert.equal(result.response.statusCode, 403);
    assert.equal(result.nextCalls, 0);
  }
});

test('employee and CRM portal sessions cannot use the ERP admin guard', async () => {
  for (const session of [
    { userName: 'alice', role: 'admin', employeePortal: true },
    { userName: 'alice', role: 'admin', crmPortal: true }
  ]) {
    const result = await runMiddleware({ row: { role: 'admin', account_status: 'Active' }, session });
    assert.equal(result.response.statusCode, 403);
    assert.equal(result.nextCalls, 0);
    assert.equal(result.queryCall, undefined);
  }
});

test('database lookup errors are forwarded and do not grant access', async () => {
  const databaseError = new Error('database unavailable');
  const result = await runMiddleware({ error: databaseError });
  assert.equal(result.nextCalls, 1);
  assert.equal(result.forwardedError, databaseError);
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.response.payload, null);
});
