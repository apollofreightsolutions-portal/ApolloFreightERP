'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  passwordChangePolicyError
} = require('../src/password-change-policy');

test('password change accepts a different password within the reset policy length bounds', () => {
  assert.equal(passwordChangePolicyError('current-password', 'new-strong-password'), '');
  assert.equal(passwordChangePolicyError('old', 'a'.repeat(MIN_PASSWORD_LENGTH)), '');
  assert.equal(passwordChangePolicyError('old', 'b'.repeat(MAX_PASSWORD_LENGTH)), '');
});

test('password change rejects passwords shorter than the 12-character reset minimum', () => {
  const error = passwordChangePolicyError('current-password', 'short');
  assert.match(error, /12 and 128 characters/);
});

test('password change rejects passwords longer than the 128-character reset maximum', () => {
  const error = passwordChangePolicyError('current-password', 'x'.repeat(MAX_PASSWORD_LENGTH + 1));
  assert.match(error, /12 and 128 characters/);
});

test('password change rejects reusing the current password', () => {
  assert.match(passwordChangePolicyError('same-password-here', 'same-password-here'), /different from your current password/);
});
