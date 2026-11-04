'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { timingSafeStringEqual } = require('../src/token-signature');

test('signature comparison accepts exact equal values', () => {
  assert.equal(timingSafeStringEqual('valid-base64url-signature', 'valid-base64url-signature'), true);
});

test('signature comparison rejects same-length tampering', () => {
  assert.equal(timingSafeStringEqual('valid-base64url-signature', 'valid-base64url-signaturE'), false);
});

test('signature comparison safely rejects different lengths without throwing', () => {
  assert.equal(timingSafeStringEqual('expected-signature', 'short'), false);
  assert.equal(timingSafeStringEqual('', 'unexpected'), false);
});

test('signature comparison handles non-ASCII input by comparing encoded bytes safely', () => {
  assert.equal(timingSafeStringEqual('signature-é', 'signature-é'), true);
  assert.equal(timingSafeStringEqual('signature-é', 'signature-e'), false);
});
