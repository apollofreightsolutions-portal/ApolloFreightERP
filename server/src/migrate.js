const fs = require("fs");
const path = require("path");
const { closePool, getPool } = require("./db");
const { nodeEnv } = require("./config");

const sqlDir = path.resolve(__dirname, "..", "sql");
const MIGRATION_LOCK_KEY = "apollo_freight_schema_migration";
const MIGRATION_LOCK_TIMEOUT_MS = Number(process.env.MIGRATION_LOCK_TIMEOUT_MS || 10000);
const MIGRATION_STATEMENT_TIMEOUT_MS = Number(process.env.MIGRATION_STATEMENT_TIMEOUT_MS || 600000);
const MIGRATION_LOCK_RETRIES = Number(process.env.MIGRATION_LOCK_RETRIES || 8);
const MIGRATION_LOCK_RETRY_DELAY_MS = Number(process.env.MIGRATION_LOCK_RETRY_DELAY_MS || 5000);

function listSqlFiles() {
  return fs
    .readdirSync(sqlDir)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();
}

function normalizeSql(sql) {
  return sql
    .replace(/^\s*```sql\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function isProductionMigrationApproved() {
  return String(process.env.ALLOW_PRODUCTION_MIGRATIONS || "").trim().toLowerCase() === "true";
}

function isRetryableLockError(error) {
  return error?.code === "55P03" || error?.code === "57014" || /lock timeout|canceling statement due to lock timeout/i.test(String(error?.message || ""));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function applyMigration(client, fileName, sql, logger) {
  for (let attempt = 1; attempt <= MIGRATION_LOCK_RETRIES + 1; attempt += 1) {
    try {
      await client.query(sql);
      return;
    } catch (error) {
      if (!isRetryableLockError(error) || attempt > MIGRATION_LOCK_RETRIES) throw error;
      const delay = MIGRATION_LOCK_RETRY_DELAY_MS * attempt;
      logger.warn(`${fileName} is waiting for a database lock; retry ${attempt}/${MIGRATION_LOCK_RETRIES} in ${delay}ms.`);
      await sleep(delay);
    }
  }
}

async function runMigrations({ logger = console } = {}) {
  if (String(nodeEnv || "").toLowerCase() === "production" && !isProductionMigrationApproved()) {
    throw new Error(
      "Production migrations are blocked. Set ALLOW_PRODUCTION_MIGRATIONS=true on the isolated migration job after reviewing the exact migration plan."
    );
  }

  const client = await getPool().connect();
  let lockAcquired = false;
  try {
    await client.query("select set_config('lock_timeout', $1, false)", [`${MIGRATION_LOCK_TIMEOUT_MS}ms`]);
    await client.query("select set_config('statement_timeout', $1, false)", [`${MIGRATION_STATEMENT_TIMEOUT_MS}ms`]);
    await client.query("select set_config('idle_in_transaction_session_timeout', '60000', false)");

    const lockResult = await client.query("select pg_try_advisory_lock(hashtext($1)) as locked", [MIGRATION_LOCK_KEY]);
    lockAcquired = lockResult.rows[0]?.locked === true;
    if (!lockAcquired) {
      throw new Error("Another database migration is already running; no migration was applied.");
    }

  const files = listSqlFiles();

  for (const fileName of files) {
    if (fileName === "002_seed.sql") {
      const seeded = await client.query("select exists (select 1 from app_users limit 1) as seeded");
      if (seeded.rows[0]?.seeded) {
        logger.log("Skipping 002_seed.sql because live data already exists.");
        continue;
      }
    }

    const sql = normalizeSql(fs.readFileSync(path.join(sqlDir, fileName), "utf8"));
    logger.log(`Applying ${fileName}`);
    await applyMigration(client, fileName, sql, logger);
  }

  logger.log(`Database ready: ${files.length} SQL file(s) applied.`);
  } finally {
    if (lockAcquired) {
      await client.query("select pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK_KEY]).catch(() => {});
    }
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error.message);
      await closePool().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  runMigrations
};
