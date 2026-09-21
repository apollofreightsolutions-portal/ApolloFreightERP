const fs = require("fs");
const path = require("path");

// Production intentionally does NOT replay every migration on boot (see config.js). That means a
// newly deployed feature can reach production before its table exists ("relation ... does not
// exist"). This guard runs only the small, idempotent 041 catch-up file, and only when something
// Apollo AI / Connected Chat needs is actually missing, once per process.

const SQL_FILE = path.resolve(__dirname, "..", "sql", "041_ensure_chat_ai_schema.sql");
let ready = null;

async function isSchemaPresent(query) {
  const result = await query(
    `select
       to_regclass('connected_chat_messages') is not null as chat_table,
       to_regclass('ai_audit_log') is not null as audit_table,
       exists (
         select 1 from information_schema.columns
         where table_schema = current_schema() and table_name = 'app_users' and column_name = 'ai_access'
       ) as ai_column`
  );
  const row = result.rows[0] || {};
  return Boolean(row.chat_table && row.audit_table && row.ai_column);
}

async function applyCatchUp(query) {
  if (await isSchemaPresent(query)) return;
  const sql = fs.readFileSync(SQL_FILE, "utf8").trim();
  console.log("Applying 041_ensure_chat_ai_schema.sql (Apollo AI / Connected Chat tables were missing).");
  try {
    await query(sql);
  } catch (error) {
    // Another instance may have created the objects at the same moment.
    if (!(await isSchemaPresent(query).catch(() => false))) throw error;
  }
}

// Lookup indexes that make saving a shipment fast (AWB group synchronization joins on
// lower(trim(job_no))). "if not exists" makes this safe to run on every start.
let indexesReady = null;
const SHIPMENT_INDEX_SQL = [
  "create index if not exists idx_shipments_job_no_normalized on shipments (lower(trim(job_no)))",
  "create index if not exists idx_shipment_status_history_job_no_normalized on shipment_status_history (lower(trim(job_no)))"
];

function ensureShipmentIndexes(query) {
  if (!indexesReady) {
    indexesReady = (async () => {
      for (const sql of SHIPMENT_INDEX_SQL) await query(sql);
    })().catch((error) => {
      indexesReady = null;
      throw error;
    });
  }
  return indexesReady;
}

function ensureChatAiSchema(query) {
  if (!ready) {
    ready = applyCatchUp(query).catch((error) => {
      ready = null; // allow a retry on the next request
      throw error;
    });
  }
  return ready;
}

module.exports = { ensureChatAiSchema, ensureShipmentIndexes };
