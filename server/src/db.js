const { Pool } = require("pg");
const { databaseUrl, nodeEnv } = require("./config");

let pool = null;

// Cloud Run's Cloud SQL integration connects over a local Unix socket
// (postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE) rather than a normal
// TCP host. That connection is already local/trusted, so it must NOT use TLS - unlike Neon or any
// other regular TCP Postgres host in production, which does need it.
function isCloudSqlSocketUrl(value) {
  return /[?&]host=%2Fcloudsql%2F|[?&]host=\/cloudsql\//.test(value || "");
}

function getPool() {
  if (pool) {
    return pool;
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const useSsl = nodeEnv === "production" && !isCloudSqlSocketUrl(databaseUrl);

  // The default pool size (10) with no wait limit meant that when several users' screens were
  // refreshing at once, a save (e.g. New Shipment) could sit in the queue waiting for a free
  // connection until the browser gave up. A bigger pool plus a bounded wait makes that either
  // succeed or fail fast with a clear error. Both are tunable through Cloud Run env vars.
  const poolMax = Math.max(5, Number.parseInt(process.env.PG_POOL_MAX || "20", 10) || 20);
  const connectionTimeoutMillis = Math.max(2000, Number.parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || "10000", 10) || 10000);

  pool = new Pool({
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis: 30000,
    ssl: useSsl
      ? {
          rejectUnauthorized: false
        }
      : false
  });

  return pool;
}

async function query(text, params) {
  return getPool().query(text, params);
}

async function testConnection() {
  const result = await query("select now() as server_time");
  return result.rows[0];
}

async function closePool() {
  if (!pool) {
    return;
  }

  await pool.end();
  pool = null;
}

module.exports = {
  closePool,
  getPool,
  query,
  testConnection
};
