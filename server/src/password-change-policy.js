'use strict';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function passwordChangePolicyError(currentPassword, newPassword) {
  const current = String(currentPassword || '');
  const next = String(newPassword || '');
  if (next.length < MIN_PASSWORD_LENGTH || next.length > MAX_PASSWORD_LENGTH) {
    return `Choose a password between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (next === current) return 'Choose a new password different from your current password.';
  return '';
}

module.exports = { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, passwordChangePolicyError };
