'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const reporting = require('../../web/shipment-reporting');

test('Live branch classifier uses explicit KWI and DBX markers before stale stored values', () => {
  assert.equal(reporting.branchForShipment({ jobNo: 'AFS-0001/MM/KWI/EXP', branch: 'Dubai' }), 'Kuwait HO');
  assert.equal(reporting.branchForShipment({ jobNo: 'AFS-0002/MM/DBX/EXP', branch: 'Kuwait HO' }), 'Dubai');
});

test('legacy shared AFS serials fall back to their saved branch instead of Dubai', () => {
  assert.equal(reporting.branchForShipment({ jobNo: 'AFS-2605001', branch: 'Kuwait HO' }), 'Kuwait HO');
  assert.equal(reporting.branchForShipment({ jobNo: 'AFS-2605002', branch: 'Dubai' }), 'Dubai');
  assert.equal(reporting.branchForShipment({ jobNo: 'AFS-2605003' }), '');
});

test('reporting cutoff remains 1 September 2026 Kuwait time and explicit live mode remains included', () => {
  assert.equal(reporting.beforeCutoff({ createdAt: '2026-08-31T20:59:59.999Z' }), true);
  assert.equal(reporting.beforeCutoff({ createdAt: '2026-08-31T21:00:00.000Z' }), false);
  assert.equal(reporting.classification({ jobNo: 'AFS-OLD', createdAt: '2026-05-01', reportingMode: 'auto' }).excluded, true);
  assert.equal(reporting.classification({ jobNo: 'AFS-OLD', createdAt: '2026-05-01', reportingMode: 'live' }).excluded, false);
});
