'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { encryptSecret, decryptSecretWithFallback } = require('../src/mfa');

test('MFA ciphertext decrypts with active key without requesting migration', () => {
  const dedicatedMfaKey = 'dedicated-persisted-mfa-key';
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', dedicatedMfaKey);
  // Password updates never participate in MFA encryption or decryption.
  const beforePasswordChange = decryptSecretWithFallback(encrypted, dedicatedMfaKey, ['old-password-value']);
  const afterPasswordChange = decryptSecretWithFallback(encrypted, dedicatedMfaKey, ['new-password-value']);
  assert.deepEqual(beforePasswordChange, {
    secret: 'JBSWY3DPEHPK3PXP',
    usedFallback: false
  });
  assert.deepEqual(afterPasswordChange, beforePasswordChange);
});

test('legacy configured key decrypts and marks MFA ciphertext for migration', () => {
  const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', 'legacy-configured-key');
  const decrypted = decryptSecretWithFallback(encrypted, 'dedicated-mfa-key', ['old-database-signing-key', 'legacy-configured-key']);
  assert.deepEqual(decrypted, { secret: 'JBSWY3DPEHPK3PXP', usedFallback: true });
  const migrated = encryptSecret(decrypted.secret, 'dedicated-mfa-key');
  assert.deepEqual(decryptSecretWithFallback(migrated, 'dedicated-mfa-key', ['old-database-signing-key', 'legacy-configured-key']), {
    secret: 'JBSWY3DPEHPK3PXP',
    usedFallback: false
  });
});

test('invalid or unrecognized MFA ciphertext fails with a safe typed error', () => {
  assert.throws(
    () => decryptSecretWithFallback('v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA', 'active-key', 'legacy-key'),
    (error) => error.code === 'MFA_SECRET_DECRYPTION_FAILED' && !/authenticate data/.test(error.message)
  );
});
