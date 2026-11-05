'use strict';

const SHARED_REFERENCE_RESOURCES = new Set(['customers', 'suppliers', 'tariffs', 'settings', 'hs-code-master', 'users']);
const COST_FIELDS = ['supplier_cost', 'total_cost'];
const PROFIT_FIELDS = ['gross_profit', 'profit_percent'];

function truthy(value) {
  return value === true || value === 1 || ['true', 't', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizeBranch(value) {
  const branch = String(value || '').trim().toLowerCase();
  if (['branch 1', 'kuwait 1', 'kuwait', 'kuwait ho', 'kuwait branch', 'kuwait hq', 'kuwait head office', 'kwi'].includes(branch)) return 'kuwait ho';
  if (['branch 2', 'dubai 2', 'dubai', 'dubai branch', 'dbx'].includes(branch)) return 'dubai';
  return branch;
}

function roleKey(session) {
  return String(session?.role || '').trim().toLowerCase();
}

function isErpAdmin(session) {
  return roleKey(session) === 'admin' && !session?.employeePortal && !session?.crmPortal && !session?.customerPortal;
}

function canViewAllBranches(session) {
  const scope = String(session?.branchViewScope || session?.branch_view_scope || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return isErpAdmin(session) || scope === 'all branches';
}

function branchAccessList(session) {
  const raw = String(session?.branchAccess || session?.branch_access || 'Kuwait HO').trim();
  if (!raw || ['both', 'all', 'all branches'].includes(raw.toLowerCase())) return null;
  return raw.split(',').map(normalizeBranch).filter(Boolean);
}

function branchIsAllowed(branch, session) {
  const key = normalizeBranch(branch);
  if (!key || canViewAllBranches(session)) return true;
  // Records shared by every branch (for example customers/suppliers set to "Both") stay visible.
  if (['both', 'all', 'all branches'].includes(key)) return true;
  const access = branchAccessList(session);
  return access === null || access.includes(key);
}

function shipmentReferencesForRows(resourceName, rows) {
  const references = new Set();
  const add = (value) => {
    const key = String(value || '').trim().toLowerCase();
    if (key) references.add(key);
  };
  for (const row of rows || []) {
    if (resourceName === 'invoices' || resourceName === 'additional-charges') {
      String(row.shipment_no || row.shipmentNo || '').split(/[,;\n]+/).forEach(add);
    }
    else if (resourceName === 'documents') add(row.linked_no || row.linkedNo);
    else if (resourceName === 'shipment-cargo-items' || resourceName === 'shipment-status-history') add(row.job_no || row.jobNo);
    else if (resourceName === 'consolidations') {
      String(row.job_numbers || row.jobNumbers || '').split(/[,;\n]+/).forEach(add);
    }
  }
  return [...references];
}

function branchMatchesForRow(resourceName, row, shipmentMap) {
  const directBranch = String(row?.branch || '').trim();
  if (directBranch) return [directBranch];
  const refs = [];
  if (resourceName === 'invoices' || resourceName === 'additional-charges') {
    refs.push(...String(row?.shipment_no || row?.shipmentNo || '').split(/[,;\n]+/));
  }
  else if (resourceName === 'documents') refs.push(row?.linked_no || row?.linkedNo);
  else if (resourceName === 'shipment-cargo-items') refs.push(row?.job_no || row?.jobNo);
  else if (resourceName === 'consolidations') refs.push(...String(row?.job_numbers || row?.jobNumbers || '').split(/[,;\n]+/));
  const branches = new Set();
  for (const ref of refs) {
    const values = shipmentMap?.get?.(String(ref || '').trim().toLowerCase()) || [];
    for (const value of values) {
      const branch = typeof value === 'string' ? value : value?.branch;
      if (String(branch || '').trim()) branches.add(String(branch).trim());
    }
  }
  return [...branches];
}

function canViewAllEntries(session) {
  if (isErpAdmin(session)) return true;
  // The existing portal treats All Branches as an all-entry view. An explicit
  // self-only grant takes precedence if permissions are configured inconsistently.
  const selfOnly = truthy(session?.canViewOnlySelfEntry ?? session?.can_view_only_self_entry);
  return !selfOnly && (canViewAllBranches(session) || truthy(session?.canViewAllEntry ?? session?.can_view_all_entry));
}

function rowOwners(resourceName, row, shipmentMap) {
  const values = [
    row?.created_by, row?.createdBy,
    row?.requested_by, row?.requestedBy,
    row?.updated_by, row?.updatedBy,
    row?.owner, row?.user, row?.user_id, row?.userId,
    row?.user_name, row?.userName, row?.username
  ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

  if (resourceName === 'shipment-cargo-items' || resourceName === 'shipment-status-history') {
    const refs = shipmentReferencesForRows(resourceName, [row]);
    for (const ref of refs) {
      const parents = shipmentMap?.get?.(ref) || [];
      for (const parent of parents) {
        const owner = String(parent?.created_by || '').trim().toLowerCase();
        if (owner) values.push(owner);
      }
    }
  }
  return values;
}

function rowIsVisible(resourceName, row, session, shipmentMap = new Map()) {
  if (session?.employeePortal) return true; // HR routes apply their own current-user/HR-admin policy.
  const branches = branchMatchesForRow(resourceName, row, shipmentMap);
  if (branches.some((branch) => !branchIsAllowed(branch, session))) return false;

  if (SHARED_REFERENCE_RESOURCES.has(resourceName)) return true;
  if (canViewAllEntries(session)) return true;

  const username = String(session?.userName || session?.user_name || '').trim().toLowerCase();
  return Boolean(username) && rowOwners(resourceName, row, shipmentMap).includes(username);
}

function redactCostProfit(value, allowCost, allowProfit) {
  if (Array.isArray(value)) return value.map((item) => redactCostProfit(item, allowCost, allowProfit));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    if (!allowCost && /(^|_)(supplier_)?cost($|_)|(^|_)buy_cost($|_)/.test(normalized)) continue;
    if (!allowProfit && /(^|_)(gross_)?profit($|_)|(^|_)margin($|_)/.test(normalized)) continue;
    result[key] = redactCostProfit(item, allowCost, allowProfit);
  }
  return result;
}

function redactJsonField(value, allowCost, allowProfit) {
  if (typeof value !== 'string' || !value.trim()) return value;
  try {
    return JSON.stringify(redactCostProfit(JSON.parse(value), allowCost, allowProfit));
  } catch {
    // Malformed legacy JSON is not echoed when its access policy cannot be inspected.
    return '{}';
  }
}

function costProfitAccess(session) {
  const role = roleKey(session);
  const financeRole = isErpAdmin(session) || ['accountant', 'accounts', 'billing', 'billings'].includes(role);
  const allowCost = financeRole && (isErpAdmin(session) || truthy(session?.canBillingCostEntry ?? session?.can_billing_cost_entry));
  const allowProfit = financeRole;
  return { allowCost, allowProfit };
}

const COST_KEY = /(^|_)(supplier_)?cost($|_)|(^|_)buy_cost($|_)/;
const PROFIT_KEY = /(^|_)(gross_)?profit($|_)|(^|_)margin($|_)/;
function hiddenKey(key, allowCost, allowProfit) {
  const normalized = String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return (!allowCost && COST_KEY.test(normalized)) || (!allowProfit && PROFIT_KEY.test(normalized));
}

// Put back the cost/profit values this user is not allowed to see, so a save made from
// the redacted copy in the browser can never wipe them from the stored record.
function mergeHiddenValues(stored, submitted, allowCost, allowProfit) {
  if (Array.isArray(stored) && Array.isArray(submitted)) {
    return submitted.map((item, index) => index < stored.length ? mergeHiddenValues(stored[index], item, allowCost, allowProfit) : item);
  }
  if (stored && submitted && typeof stored === 'object' && typeof submitted === 'object' && !Array.isArray(stored) && !Array.isArray(submitted)) {
    const result = { ...submitted };
    for (const key of Object.keys(result)) {
      if (hiddenKey(key, allowCost, allowProfit)) delete result[key];
    }
    for (const [key, value] of Object.entries(stored)) {
      if (hiddenKey(key, allowCost, allowProfit)) result[key] = value;
      else if (Object.prototype.hasOwnProperty.call(result, key)) result[key] = mergeHiddenValues(value, result[key], allowCost, allowProfit);
    }
    return result;
  }
  return submitted;
}

const INVOICE_COST_BODY_KEYS = ['supplier_cost', 'supplierCost', 'total_cost', 'totalCost'];
const INVOICE_PROFIT_BODY_KEYS = ['gross_profit', 'grossProfit', 'profit_percent', 'profitPercent'];
const INVOICE_JSON_BODY_KEYS = [
  ['invoice_lines_json', 'invoiceLinesJson'], ['tariff_snapshot_json', 'tariffSnapshotJson'], ['invoice_snapshot_json', 'invoiceSnapshotJson']
];

// storedRow is the current database row for an update, or null for a new invoice.
function protectInvoiceWriteBody(body, session, storedRow) {
  const { allowCost, allowProfit } = costProfitAccess(session);
  if (allowCost && allowProfit) return body;
  const result = { ...(body || {}) };
  if (!allowCost) for (const key of INVOICE_COST_BODY_KEYS) delete result[key];
  if (!allowProfit) for (const key of INVOICE_PROFIT_BODY_KEYS) delete result[key];
  for (const names of INVOICE_JSON_BODY_KEYS) {
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(result, name) || typeof result[name] !== 'string' || !result[name].trim()) continue;
      let submitted;
      try { submitted = JSON.parse(result[name]); } catch { continue; }
      let stored = null;
      try { stored = storedRow && storedRow[names[0]] ? JSON.parse(storedRow[names[0]]) : null; } catch { stored = null; }
      const merged = stored === null
        ? redactCostProfit(submitted, allowCost, allowProfit)
        : mergeHiddenValues(stored, submitted, allowCost, allowProfit);
      result[name] = JSON.stringify(merged);
    }
  }
  return result;
}

function sanitizeResourceRow(resourceName, row, session) {
  const result = { ...row };
  const { allowCost, allowProfit } = costProfitAccess(session);

  if (resourceName !== 'invoices') return result;

  if (!allowCost) for (const key of COST_FIELDS) delete result[key];
  if (!allowProfit) for (const key of PROFIT_FIELDS) delete result[key];
  for (const key of ['invoice_lines_json', 'tariff_snapshot_json', 'invoice_snapshot_json']) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      result[key] = redactJsonField(result[key], allowCost, allowProfit);
    }
  }
  return result;
}

function applyResourceReadScope(resourceName, rows, session, shipmentMap = new Map()) {
  return (rows || [])
    .filter((row) => rowIsVisible(resourceName, row, session, shipmentMap))
    .map((row) => sanitizeResourceRow(resourceName, row, session));
}

function longestSerialNumber(value) {
  const matches = [...String(value || '').matchAll(/\d+/g)];
  if (!matches.length) return 0;
  const longest = matches.reduce((selected, current) => current[0].length > selected[0].length ? current : selected, matches[0]);
  return Number(longest[0]) || 0;
}

function shipmentNumberMaxima(rows) {
  const jobByBranch = {};
  const awbByBranch = {};
  for (const row of rows || []) {
    const branch = normalizeBranch(row?.branch);
    if (!branch) continue;
    jobByBranch[branch] = Math.max(jobByBranch[branch] || 0, longestSerialNumber(row?.job_no));
    awbByBranch[branch] = Math.max(awbByBranch[branch] || 0, longestSerialNumber(row?.airway_bill_no));
  }
  return { jobByBranch, awbByBranch };
}

function buildShipmentReferenceMap(rows) {
  const map = new Map();
  const add = (reference, row) => {
    const key = String(reference || '').trim().toLowerCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    const entries = map.get(key);
    if (!entries.some((item) => String(item.job_no || '').toLowerCase() === String(row.job_no || '').toLowerCase())) {
      entries.push(row);
    }
  };
  for (const row of rows || []) {
    add(row.job_no, row);
    add(row.airway_bill_no, row);
  }
  return map;
}

module.exports = {
  applyResourceReadScope,
  buildShipmentReferenceMap,
  canViewAllBranches,
  isErpAdmin,
  normalizeBranch,
  protectInvoiceWriteBody,
  rowIsVisible,
  sanitizeResourceRow,
  shipmentNumberMaxima,
  shipmentReferencesForRows
};
