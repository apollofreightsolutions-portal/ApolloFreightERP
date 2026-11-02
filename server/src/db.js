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

function removeSslModeOverrides(value, cloudSqlSocket) {
  const connectionString = String(value || "");
  const queryStart = connectionString.indexOf("?");
  if (queryStart < 0) return connectionString;

  const fragmentStart = connectionString.indexOf("#", queryStart);
  const queryEnd = fragmentStart < 0 ? connectionString.length : fragmentStart;
  const parameters = new URLSearchParams(connectionString.slice(queryStart + 1, queryEnd));
  const unsafeKeys = new Set(["ssl", "sslmode", "uselibpqcompat"]);
  if (cloudSqlSocket) {
    unsafeKeys.add("sslcert");
    unsafeKeys.add("sslkey");
    unsafeKeys.add("sslrootcert");
  }
  for (const key of [...parameters.keys()]) {
    if (unsafeKeys.has(key.toLowerCase())) parameters.delete(key);
  }

  const query = parameters.toString();
  return connectionString.slice(0, queryStart)
    + (query ? `?${query}` : "")
    + (fragmentStart < 0 ? "" : connectionString.slice(fragmentStart));
}

function buildDatabaseConnectionOptions(connectionString, environment = nodeEnv, caCertificate = process.env.DATABASE_SSL_CA || "") {
  const cloudSqlSocket = isCloudSqlSocketUrl(connectionString);
  const useSsl = String(environment || "").toLowerCase() === "production" && !cloudSqlSocket;
  const ssl = useSsl
    ? {
        rejectUnauthorized: true,
        ...(caCertificate ? { ca: String(caCertificate).replace(/\\n/g, "\n") } : {})
      }
    : false;

  return {
    connectionString: removeSslModeOverrides(connectionString, cloudSqlSocket),
    ssl
  };
}

function positiveTimeout(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getPool() {
  if (pool) {
    return pool;
  }

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const connectionOptions = buildDatabaseConnectionOptions(databaseUrl, nodeEnv);

  pool = new Pool({
    ...connectionOptions,
    connectionTimeoutMillis: positiveTimeout("DB_CONNECTION_TIMEOUT_MS", 10000),
    query_timeout: positiveTimeout("DB_QUERY_TIMEOUT_MS", 30000),
    statement_timeout: positiveTimeout("DB_STATEMENT_TIMEOUT_MS", 30000),
    lock_timeout: positiveTimeout("DB_LOCK_TIMEOUT_MS", 5000),
    idle_in_transaction_session_timeout: positiveTimeout("DB_IDLE_TRANSACTION_TIMEOUT_MS", 60000)
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
  buildDatabaseConnectionOptions,
  getPool,
  query,
  testConnection
};
