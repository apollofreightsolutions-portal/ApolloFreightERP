'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildDatabaseConnectionOptions } = require('../src/db');

test('production TCP PostgreSQL connections require certificate validation', () => {
  const options = buildDatabaseConnectionOptions(
    'postgresql://user:secret@db.example.test/app?sslmode=no-verify&ssl=no-verify&application_name=apollo',
    'production'
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.match(options.connectionString, /application_name=apollo/);
  assert.doesNotMatch(options.connectionString, /sslmode|ssl=/i);
});

test('custom CA PEM can be supplied through DATABASE_SSL_CA', () => {
  const ca = '-----BEGIN CERTIFICATE-----\\nexample\\n-----END CERTIFICATE-----';
  const options = buildDatabaseConnectionOptions('postgres://user@db.example.test/app', 'production', ca);
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(options.ssl.ca, '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----');
});

test('Cloud SQL Unix sockets remain TLS-free and discard URL TLS toggles', () => {
  const options = buildDatabaseConnectionOptions(
    'postgresql://user:secret@/app?host=%2Fcloudsql%2Fproject%3Aregion%3Ainstance&sslmode=require&sslrootcert=%2Ftmp%2Fca.pem',
    'production'
  );
  assert.equal(options.ssl, false);
  assert.match(options.connectionString, /host=%2Fcloudsql%2F/);
  assert.doesNotMatch(options.connectionString, /sslmode|sslrootcert/i);
});

test('non-production connections retain TLS-off local development behavior', () => {
  const options = buildDatabaseConnectionOptions('postgres://user@localhost/app?sslmode=require', 'development');
  assert.equal(options.ssl, false);
  assert.doesNotMatch(options.connectionString, /sslmode/i);
});
