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

  pool = new Pool({
    connectionString: databaseUrl,
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
