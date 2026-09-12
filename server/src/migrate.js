const fs = require("fs");
const path = require("path");
const { closePool, query } = require("./db");

const sqlDir = path.resolve(__dirname, "..", "sql");

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

async function runMigrations({ logger = console } = {}) {
  const files = listSqlFiles();

  for (const fileName of files) {
    if (fileName === "002_seed.sql") {
      const seeded = await query("select exists (select 1 from app_users limit 1) as seeded");
      if (seeded.rows[0]?.seeded) {
        logger.log("Skipping 002_seed.sql because live data already exists.");
        continue;
      }
    }

    const sql = normalizeSql(fs.readFileSync(path.join(sqlDir, fileName), "utf8"));
    logger.log(`Applying ${fileName}`);
    await query(sql);
  }

  logger.log(`Database ready: ${files.length} SQL file(s) applied.`);
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
