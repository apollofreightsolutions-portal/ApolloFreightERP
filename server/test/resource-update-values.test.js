'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { CLEARABLE_UPDATE_FIELDS, collectValues } = require('../src/resource-update-values');

function config(table, fields, key = fields[0].column) {
  return { table, key, fields };
}

function field(column, ...names) {
  return { column, names: names.length ? names : [column] };
}

test('generic updates can clear explicitly allowlisted shipment fields', () => {
  const shipment = config('shipments', [
    field('job_no', 'jobNo', 'job_no'),
    field('airway_bill_no', 'airwayBillNo', 'airway_bill_no'),
    field('tariff_no', 'tariffNo', 'tariff_no'),
    field('notes')
  ]);
  const result = collectValues(shipment, {
    jobNo: '14366/11/KWI/LI',
    airwayBillNo: '',
    tariffNo: '',
    notes: ''
  }, false, CLEARABLE_UPDATE_FIELDS[shipment.table]);

  assert.deepEqual(result, {
    columns: ['airway_bill_no', 'tariff_no'],
    values: ['', '']
  });
});

test('empty values outside the resource-specific allowlist are not applied from full-record payloads', () => {
  const shipment = config('shipments', [
    field('branch'),
    field('airway_bill_no'),
    field('customer_name'),
    field('status')
  ]);
  const result = collectValues(shipment, {
    branch: '',
    airway_bill_no: '',
    customer_name: '',
    status: ''
  }, false, CLEARABLE_UPDATE_FIELDS[shipment.table]);

  assert.deepEqual(result, { columns: ['airway_bill_no'], values: [''] });
});

test('plain invoice notes can be cleared without allowing shipment metadata notes to be erased', () => {
  const invoice = config('invoices', [field('notes'), field('tariff_no')], 'invoice_no');
  assert.deepEqual(
    collectValues(invoice, { notes: '', tariff_no: '' }, false, CLEARABLE_UPDATE_FIELDS[invoice.table]),
    { columns: ['notes', 'tariff_no'], values: ['', ''] }
  );
  assert.equal(CLEARABLE_UPDATE_FIELDS.shipments.has('notes'), false);
  assert.equal(CLEARABLE_UPDATE_FIELDS.consolidations.has('notes'), false);
});

test('insert collection keeps the existing empty-string skip behavior', () => {
  const shipment = config('shipments', [field('airway_bill_no'), field('notes')]);
  assert.deepEqual(collectValues(shipment, { airway_bill_no: '', notes: '' }), { columns: [], values: [] });
});

test('undefined fields remain omitted and user-supplied nulls remain explicit updates', () => {
  const invoice = config('invoices', [field('notes'), field('tariff_no'), field('grand_total')], 'invoice_no');
  const result = collectValues(invoice, { notes: undefined, tariff_no: null, grand_total: '' }, false, CLEARABLE_UPDATE_FIELDS[invoice.table]);
  assert.deepEqual(result, { columns: ['tariff_no'], values: [null] });
});

test('allowlist does not clear numeric, date, status, JSON or document metadata fields with empty strings', () => {
  const request = config('shipment_requests', [
    field('quantity'), field('invoice_value'), field('status'), field('attachments_json'), field('remarks')
  ], 'request_no');
  assert.equal(CLEARABLE_UPDATE_FIELDS[request.table].has('invoice_value'), false);
  const result = collectValues(request, {
    quantity: '', invoice_value: '', status: '', attachments_json: '', remarks: ''
  }, false, CLEARABLE_UPDATE_FIELDS[request.table]);
  assert.deepEqual(result, { columns: ['remarks'], values: [''] });
  assert.equal(CLEARABLE_UPDATE_FIELDS.documents, undefined, 'document metadata is deliberately not clearable by generic updates');
});
