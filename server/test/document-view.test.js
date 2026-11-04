'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { findNonEmployeeDocument } = require('../src/document-view');

const employeeTypes = ['Employee Photo', 'Civil ID Front', 'Civil ID Back', 'Passport Front', 'Passport Back', 'Work Permit', 'Other'];

test('general document view lookup excludes all HR employee document types case-insensitively', async () => {
  let call;
  const item = { type: 'POD', storage_url: 'https://example.test/pod.pdf' };
  const result = await findNonEmployeeDocument(async (...args) => {
    call = args;
    return { rows: [item] };
  }, 'POD-JOB-1', employeeTypes);

  assert.equal(result, item);
  assert.match(call[0], /lower\(coalesce\(type, ''\)\) <> all\(\$2::text\[\]\)/i);
  assert.deepEqual(call[1], ['POD-JOB-1', employeeTypes.map((type) => type.toLowerCase())]);
  assert.equal(call[0].includes('Employee Photo'), false, 'employee type names must be passed as SQL parameters');
});

test('general document view lookup returns no row when the query has no permitted document', async () => {
  const result = await findNonEmployeeDocument(async () => ({ rows: [] }), 'EMP-ALICE-PASSPORT', employeeTypes);
  assert.equal(result, null);
});

test('general document lookup propagates database errors rather than bypassing the exclusion', async () => {
  const failure = new Error('database unavailable');
  await assert.rejects(
    findNonEmployeeDocument(async () => { throw failure; }, 'EMP-ALICE-PASSPORT', employeeTypes),
    failure
  );
});
