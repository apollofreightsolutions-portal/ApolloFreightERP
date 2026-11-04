'use strict';

async function findNonEmployeeDocument(query, documentNo, employeeDocumentTypes) {
  const blockedTypes = [...(employeeDocumentTypes || [])]
    .map((type) => String(type || '').trim().toLowerCase())
    .filter(Boolean);
  const result = await query(
    `select storage_url, file_name, type, notes
     from documents
     where document_no = $1
       and lower(coalesce(type, '')) <> all($2::text[])
     limit 1`,
    [String(documentNo || '').trim(), blockedTypes]
  );
  return result.rows?.[0] || null;
}

module.exports = { findNonEmployeeDocument };
