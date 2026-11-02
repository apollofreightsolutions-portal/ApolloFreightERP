'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { updatePasswordByUsername, updatePasswordById } = require('../src/session-revocation');

function fakeQuery() {
  const calls = [];
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim().toLowerCase(), params });
      return { rows: [{ auth_session_version: 8 }] };
    }
  };
}

test('self-service password update increments the current database session version atomically', async () => {
  const database = fakeQuery();
  const result = await updatePasswordByUsername(database.query, 'nilesh', 'hashed-password');
  assert.equal(result.rows[0].auth_session_version, 8);
  assert.match(database.calls[0].sql, /set password = \$1, auth_session_version = coalesce\(auth_session_version, 0\) \+ 1/);
  assert.match(database.calls[0].sql, /where user_name = \$2/);
  assert.deepEqual(database.calls[0].params, ['hashed-password', 'nilesh']);
});

test('admin password update increments the target user session version atomically', async () => {
  const database = fakeQuery();
  const result = await updatePasswordById(database.query, 42, 'another-hash');
  assert.equal(result.rows[0].auth_session_version, 8);
  assert.match(database.calls[0].sql, /set password = \$2, auth_session_version = coalesce\(auth_session_version, 0\) \+ 1/);
  assert.match(database.calls[0].sql, /where id = \$1/);
  assert.deepEqual(database.calls[0].params, [42, 'another-hash']);
});
