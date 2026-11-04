'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  invoiceLineAmount,
  normalizeInvoiceLineAmount,
  numberOrExisting
} = require('../../web/invoice-values.mjs');

test('invoice numeric selection preserves explicit number and string zero instead of restoring an older value', () => {
  assert.equal(numberOrExisting(0, 125), 0);
  assert.equal(numberOrExisting('0', 125), 0);
});

test('invoice numeric selection falls back only for missing or empty values', () => {
  assert.equal(numberOrExisting(undefined, 125), 125);
  assert.equal(numberOrExisting('', 125), 125);
});

test('invoice numeric selection safely defaults absent values to zero', () => {
  assert.equal(numberOrExisting(undefined, undefined), 0);
  assert.equal(numberOrExisting('', null), 0);
});

test('an explicitly entered manual zero line amount remains zero instead of using quantity times rate', () => {
  const line = { qty: 4, rate: 25, ...normalizeInvoiceLineAmount({ amount: 0, manualAmount: true }) };
  assert.equal(line.manualAmount, true);
  assert.equal(line.amount, 0);
  assert.equal(invoiceLineAmount(line), 0);
});

test('a legacy saved explicit zero amount remains zero even without a manual flag', () => {
  const line = { qty: 4, rate: 25, ...normalizeInvoiceLineAmount({ amount: 0 }) };
  assert.equal(line.amount, 0);
  assert.equal(invoiceLineAmount(line), 0);
});

test('quantity times rate is used only when neither amount nor total is supplied', () => {
  const line = { qty: 4, rate: 25, ...normalizeInvoiceLineAmount({}) };
  assert.equal(line.amount, undefined);
  assert.equal(invoiceLineAmount(line), 100);
});

test('legacy total amount alias is honored, including zero', () => {
  const line = { qty: 4, rate: 25, ...normalizeInvoiceLineAmount({ total: 0 }) };
  assert.equal(line.amount, 0);
  assert.equal(invoiceLineAmount(line), 0);
});

test('a non-manual amount can be recalculated from quantity and rate after edit logic clears it', () => {
  const line = { qty: 4, rate: 25, amount: 100, manualAmount: false };
  assert.equal(invoiceLineAmount(line), 100);
  line.qty = 2;
  line.amount = 50;
  assert.equal(invoiceLineAmount(line), 50);
});
