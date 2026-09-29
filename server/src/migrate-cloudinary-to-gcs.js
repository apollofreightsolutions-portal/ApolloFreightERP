const { Storage } = require("@google-cloud/storage");
const { closePool, query } = require("./db");

const bucketName = String(process.env.GCS_BUCKET || process.env.GOOGLE_CLOUD_STORAGE_BUCKET || "").trim();
const prefix = String(process.env.GCS_PREFIX || "apollo-freight").trim().replace(/^\/+|\/+$/g, "");
const apply = process.argv.includes("--apply");
const storage = bucketName ? new Storage() : null;
const STEP_TIMEOUT_MS = Number(process.env.MIGRATION_STEP_TIMEOUT_MS || 60000);

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${STEP_TIMEOUT_MS} ms.`)), STEP_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function decode(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function normalizeObjectName(value) {
  return decode(value).replace(/^\/+/, "").replace(/\/+/g, "/");
}

function extension(value) {
  const match = clean(value).match(/\.[a-z0-9]{1,8}$/i);
  return match ? match[0].toLowerCase() : "";
}

function cloudinaryPathFromUrl(value) {
  const text = clean(value);
  if (!text) return "";
  try {
    const parsed = new URL(text);
    const marker = "/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return "";
    let path = parsed.pathname.slice(index + marker.length);
    path = path.replace(/^v\d+\//, "");
    return normalizeObjectName(path);
  } catch {
    return "";
  }
}

function publicIdFromRecord(row, metadata) {
  const fromMetadata = clean(metadata.cloudinaryPublicId);
  if (fromMetadata) return normalizeObjectName(fromMetadata);
  return cloudinaryPathFromUrl(row.storage_url || row.attachment_url);
}

function candidateNames(row, metadata) {
  const publicId = publicIdFromRecord(row, metadata);
  if (!publicId) return [];
  const fileExt = extension(row.file_name || metadata.fileName || "");
  const values = new Set();
  const add = (value) => {
    const normalized = normalizeObjectName(value);
    if (!normalized) return;
    values.add(normalized);
    if (fileExt && !normalized.toLowerCase().endsWith(fileExt)) values.add(`${normalized}${fileExt}`);
  };
  add(publicId);
  add(publicId.startsWith(`${prefix}/`) ? publicId : `${prefix}/${publicId}`);
  return [...values];
}

function makeIndex(files) {
  const exact = new Map();
  const byBase = new Map();
  for (const file of files) {
    const name = normalizeObjectName(file.name);
    if (!name || name.endsWith("/")) continue;
    exact.set(name, name);
    const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(name);
  }
  return { exact, byBase };
}

function matchObject(row, metadata, index) {
  const candidates = candidateNames(row, metadata);
  for (const candidate of candidates) {
    if (index.exact.has(candidate)) return { status: "matched", objectName: index.exact.get(candidate), candidates };
  }
  const bases = new Set(candidates.map((value) => value.slice(value.lastIndexOf("/") + 1).toLowerCase()));
  const basenameMatches = [...bases].flatMap((base) => index.byBase.get(base) || []);
  const unique = [...new Set(basenameMatches)];
  if (unique.length === 1) return { status: "matched-basename", objectName: unique[0], candidates };
  if (unique.length > 1) return { status: "ambiguous", objectName: "", candidates, matches: unique };
  return { status: "missing", objectName: "", candidates };
}

function migratedNotes(metadata, objectName) {
  return JSON.stringify({
    ...metadata,
    storageProvider: "gcs",
    bucket: bucketName,
    objectName,
    migratedFrom: "cloudinary",
    migratedAt: new Date().toISOString()
  });
}

async function loadRows() {
  console.error("Migration dry-run: querying documents...");
  const documents = (await withTimeout(query(`
    select id, document_no, linked_no, type, file_name, storage_url, notes
    from documents
      where coalesce(storage_url, '') <> ''
      and coalesce(notes, '') not like '%\"storageProvider\":\"gcs\"%'
      and (lower(storage_url) like '%cloudinary%' or lower(notes) like '%cloudinarypublicid%')
      order by id
  `), "documents query")).rows.map((row) => ({ ...row, table: "documents", key: row.id, source: row.storage_url }));

  const leaveTable = (await withTimeout(query("select to_regclass('public.leave_requests') as table_name"), "leave_requests table check")).rows[0]?.table_name;
  let leaveRequests = [];
  if (leaveTable) {
    console.error("Migration dry-run: querying leave_requests...");
    leaveRequests = (await withTimeout(query(`
      select request_no, user_name, attachment_url, updated_at
      from leave_requests
      where coalesce(attachment_url, '') <> ''
        and coalesce(attachment_url, '') not like '%\"storageProvider\":\"gcs\"%'
        and (lower(attachment_url) like '%cloudinary%' or lower(attachment_url) like '%cloudinarypublicid%')
      order by request_no
    `), "leave_requests query")).rows.map((row) => ({ ...row, table: "leave_requests", key: row.request_no, source: row.attachment_url }));
  }
  return { documents, leaveRequests, leaveTable: Boolean(leaveTable) };
}

async function run() {
  if (!bucketName) throw new Error("GCS_BUCKET is required.");
  const bucket = storage.bucket(bucketName);
  console.error(`Migration dry-run: listing GCS objects under ${prefix}/...`);
  const [files] = await withTimeout(bucket.getFiles({ prefix: `${prefix}/` }), "GCS object listing");
  const index = makeIndex(files);
  console.error(`Migration dry-run: found ${index.exact.size} GCS objects; reading database records...`);
  const { documents, leaveRequests, leaveTable } = await withTimeout(loadRows(), "database record read");
  console.error(`Migration dry-run: read ${documents.length} documents and ${leaveRequests.length} leave attachments.`);
  const rows = [...documents, ...leaveRequests];
  const results = rows.map((row) => {
    const metadata = row.table === "documents" ? safeJson(row.notes) : safeJson(row.attachment_url);
    return { row, metadata, match: matchObject(row, metadata, index) };
  });

  const counts = results.reduce((acc, result) => {
    acc[result.match.status] = (acc[result.match.status] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    mode: apply ? "APPLY" : "DRY_RUN",
    bucket: bucketName,
    prefix,
    gcsObjectCount: index.exact.size,
    documentsScanned: documents.length,
    leaveAttachmentsScanned: leaveRequests.length,
    leaveRequestsTablePresent: leaveTable,
    matchCounts: counts
  }, null, 2));

  for (const result of results) {
    const { row, metadata, match } = result;
    console.log(JSON.stringify({
      table: row.table,
      key: row.key,
      documentNo: row.document_no,
      requestNo: row.request_no,
      linkedNo: row.linked_no,
      type: row.type,
      fileName: row.file_name || metadata.fileName || "",
      status: match.status,
      objectName: match.objectName,
      candidates: match.candidates,
      ambiguousMatches: match.matches || []
    }));
  }

  const unsafe = results.filter((result) => !["matched", "matched-basename"].includes(result.match.status));
  if (apply && unsafe.length) {
    throw new Error(`Refusing to apply: ${unsafe.length} record(s) have missing or ambiguous GCS matches. Run dry-run, resolve them, then retry.`);
  }
  if (!apply) return;

  await query("begin");
  try {
    for (const result of results) {
      const { row, metadata, match } = result;
      const notes = migratedNotes(metadata, match.objectName);
      if (row.table === "documents") {
        await query(`
          update documents
          set storage_url=$1, notes=$2, updated_at=now()
          where id=$3
            and coalesce(notes, '') not like '%"storageProvider":"gcs"%'
        `, [`gs://${bucketName}/${match.objectName}`, notes, row.key]);
      } else {
        await query(`
          update leave_requests
          set attachment_url=$1, updated_at=now()
          where request_no=$2
            and coalesce(attachment_url, '') not like '%"storageProvider":"gcs"%'
        `, [notes, row.key]);
      }
    }
    await query("commit");
    console.log(`Applied ${results.length} record migration(s).`);
  } catch (error) {
    await query("rollback").catch(() => {});
    throw error;
  }
}

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(() => closePool().catch(() => {}));
