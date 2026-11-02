'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');

function originsFor(nodeEnv, allowedOrigin) {
  const env = { ...process.env, NODE_ENV: nodeEnv, ALLOWED_ORIGIN: allowedOrigin };
  const result = spawnSync(
    process.execPath,
    ['-e', "process.stdout.write(JSON.stringify(require('./src/config').allowedOrigins))"],
    { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('production without ALLOWED_ORIGIN uses known project frontend domains, never wildcard', () => {
  const origins = originsFor('production', '');
  assert.ok(origins.includes('https://connected.apollo-freight.com'));
  assert.ok(origins.includes('https://apollo-freight.com'));
  assert.ok(origins.includes('https://www.apollo-freight.com'));
  assert.ok(!origins.includes('*'));
});

test('production wildcard configuration is filtered and falls back to known domains', () => {
  const origins = originsFor('production', '*');
  assert.ok(origins.length > 0);
  assert.ok(!origins.includes('*'));
});

test('production explicit origin allowlist is preserved', () => {
  assert.deepEqual(originsFor('production', 'https://one.example,https://two.example'), [
    'https://one.example',
    'https://two.example'
  ]);
});

test('development retains open CORS by default for local tooling', () => {
  assert.deepEqual(originsFor('development', ''), ['*']);
});
