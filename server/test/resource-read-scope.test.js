'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  applyResourceReadScope,
  buildShipmentReferenceMap,
  canViewAllBranches,
  rowIsVisible,
  sanitizeResourceRow,
  shipmentNumberMaxima,
  shipmentReferencesForRows
} = require('../src/resource-read-scope');

function session(overrides = {}) {
  return {
    userName: 'alice',
    role: 'Operations',
    branchAccess: 'Kuwait HO',
    branchViewScope: 'Assigned Branch Only',
    canViewAllEntry: false,
    canViewOnlySelfEntry: true,
    canBillingCostEntry: false,
    canBillingSalesEntry: false,
    ...overrides
  };
}

test('assigned-branch and self-only scopes filter shipment rows on the server', () => {
  const rows = [
    { job_no: 'KWI-1', branch: 'Kuwait HO', created_by: 'alice' },
    { job_no: 'KWI-2', branch: 'Kuwait', created_by: 'bob' },
    { job_no: 'DXB-1', branch: 'Dubai', created_by: 'alice' }
  ];
  assert.deepEqual(applyResourceReadScope('shipments', rows, session()).map((row) => row.job_no), ['KWI-1']);
});

test('All Branches scope preserves all-entry visibility unless self-only is explicitly enabled', () => {
  const user = session({ branchViewScope: 'All Branches', canViewOnlySelfEntry: false });
  assert.equal(canViewAllBranches(user), true);
  assert.equal(rowIsVisible('shipments', { branch: 'Dubai', created_by: 'bob' }, user), true);
  assert.equal(rowIsVisible('shipments', { branch: 'Dubai', created_by: 'alice' }, user), true);
  assert.equal(rowIsVisible('shipments', { branch: 'Dubai', created_by: 'bob' }, { ...user, canViewOnlySelfEntry: true }), false);
});

test('can_view_all_entry permits all rows only when can_view_only_self_entry is not set', () => {
  assert.equal(rowIsVisible('shipments', { branch: 'Kuwait HO', created_by: 'bob' }, session({ canViewOnlySelfEntry: false, canViewAllEntry: true })), true);
  assert.equal(rowIsVisible('shipments', { branch: 'Kuwait HO', created_by: 'bob' }, session({ canViewOnlySelfEntry: true, canViewAllEntry: true })), false);
  assert.equal(rowIsVisible('shipments', { branch: 'Dubai', created_by: 'bob' }, session({ role: 'Admin' })), true);
});

test('owner matching accepts creator, requester, and status updater fields case-insensitively', () => {
  const user = session();
  assert.equal(rowIsVisible('quotations', { branch: 'KWI', created_by: 'ALICE' }, user), true);
  assert.equal(rowIsVisible('additional-charges', { requested_by: 'Alice' }, user), true);
  assert.equal(rowIsVisible('shipment-status-history', { updated_by: 'alice' }, user), true);
  assert.equal(rowIsVisible('invoices', { created_by: 'bob' }, user), false);
});

test('invoice, charge, and document rows inherit branch from linked shipment references', () => {
  const refs = shipmentReferencesForRows('invoices', [
    { shipment_no: 'KWI-JOB-1' }, { shipment_no: 'DXB-JOB-1' }
  ]);
  assert.deepEqual(refs.sort(), ['dxb-job-1', 'kwi-job-1']);
  const shipmentMap = buildShipmentReferenceMap([
    { job_no: 'KWI-JOB-1', airway_bill_no: 'AFS100', branch: 'Kuwait HO', created_by: 'alice' },
    { job_no: 'DXB-JOB-1', airway_bill_no: 'AFS200', branch: 'Dubai', created_by: 'alice' }
  ]);
  assert.equal(rowIsVisible('invoices', { shipment_no: 'KWI-JOB-1', created_by: 'alice' }, session(), shipmentMap), true);
  assert.equal(rowIsVisible('invoices', { shipment_no: 'DXB-JOB-1', created_by: 'alice' }, session(), shipmentMap), false);
  assert.equal(rowIsVisible('documents', { linked_no: 'AFS200', created_by: 'alice' }, session(), shipmentMap), false);
  shipmentMap.set('inv-dxb-1', [{ job_no: 'DXB-JOB-1', branch: 'Dubai', created_by: 'alice' }]);
  assert.equal(rowIsVisible('documents', { linked_no: 'INV-DXB-1', created_by: 'alice' }, session(), shipmentMap), false);
});

test('shared reference data remains available for permitted branches and is still branch filtered', () => {
  const user = session();
  assert.equal(rowIsVisible('tariffs', { tariff_no: 'T-1', created_by: 'bob' }, user), true);
  assert.equal(rowIsVisible('customers', { code: 'C-1', branch: 'Kuwait HO', created_by: 'bob' }, user), true);
  assert.equal(rowIsVisible('customers', { code: 'C-2', branch: 'Dubai', created_by: 'bob' }, user), false);
});

test('shipment numbering metadata exposes only per-branch high-water marks', () => {
  assert.deepEqual(shipmentNumberMaxima([
    { job_no: '14366/11/KWI/LI', airway_bill_no: 'AFS262341', branch: 'Kuwait HO', customer_name: 'private' },
    { job_no: '14369/11/KWI/LI', airway_bill_no: 'AFS262342', branch: 'KWI' },
    { job_no: '09511/10/2026/AFS/LE', airway_bill_no: 'AFS262340', branch: 'Dubai' }
  ]), {
    jobByBranch: { 'kuwait ho': 14369, dubai: 9511 },
    awbByBranch: { 'kuwait ho': 262342, dubai: 262340 }
  });
});

test('invoice cost and profit fields are removed unless role and billing permission allow them', () => {
  const invoice = {
    supplier_cost: 80,
    total_cost: 80,
    gross_profit: 20,
    profit_percent: 20,
    invoice_lines_json: '[{"amount":100,"supplierCost":80,"grossProfit":20}]',
    tariff_snapshot_json: '{"cost":80,"rate":100}',
    invoice_snapshot_json: '{"profitPercent":20}'
  };
  const operationsView = sanitizeResourceRow('invoices', invoice, session());
  assert.equal('supplier_cost' in operationsView, false);
  assert.equal('total_cost' in operationsView, false);
  assert.equal('gross_profit' in operationsView, false);
  assert.equal('profit_percent' in operationsView, false);
  assert.deepEqual(JSON.parse(operationsView.invoice_lines_json), [{ amount: 100 }]);
  assert.deepEqual(JSON.parse(operationsView.tariff_snapshot_json), { rate: 100 });
  assert.deepEqual(JSON.parse(operationsView.invoice_snapshot_json), {});

  const accountantView = sanitizeResourceRow('invoices', invoice, session({
    role: 'Accountant', canBillingCostEntry: true, canBillingSalesEntry: true
  }));
  assert.equal(accountantView.supplier_cost, 80);
  assert.equal(accountantView.gross_profit, 20);
  assert.equal(JSON.parse(accountantView.invoice_lines_json)[0].supplierCost, 80);
});
