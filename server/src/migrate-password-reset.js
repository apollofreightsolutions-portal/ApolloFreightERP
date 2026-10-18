'use strict';

const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('./db');
const { nodeEnv } = require('./config');

const MIGRATION_FILE = path.resolve(__dirname, '../sql/049_password_reset_tokens.sql');
const MIGRATION_LOCK_KEY = 'apollo_freight_schema_migration';

async function main() {
  if (String(nodeEnv || '').toLowerCase() === 'production' && process.env.ALLOW_PRODUCTION_MIGRATIONS !== 'true') {
    throw new Error('Production migration is blocked. Set ALLOW_PRODUCTION_MIGRATIONS=true on the isolated migration job after reviewing migration 049.');
  }

  const client = await getPool().connect();
  let lockAcquired = false;
  try {
    await client.query("set lock_timeout='10s'");
    await client.query("set statement_timeout='120s'");
    const lock = await client.query("select pg_try_advisory_lock(hashtext($1)) as locked", [MIGRATION_LOCK_KEY]);
    lockAcquired = lock.rows[0]?.locked === true;
    if (!lockAcquired) throw new Error('Another migration is running. Retry later; no SQL was applied.');

    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await client.query(sql);
    console.log('Applied only 049_password_reset_tokens.sql. Added session-version, reset-token, and mail-outbox schema; existing password hashes were not changed.');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    if (lockAcquired) {
      await client.query("select pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => closePool().catch(() => {}));
}

module.exports = { main };
