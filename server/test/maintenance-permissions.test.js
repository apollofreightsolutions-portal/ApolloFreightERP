'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasMaintenanceAccess, permissionsFromErpUser } = require('../src/maintenance/permissions');

test('Maintenance access requires an explicit database assignment, including for Admin', () => {
  assert.equal(hasMaintenanceAccess({ role: 'Admin', maintenance_portal_access: false }), false);
  assert.equal(hasMaintenanceAccess({ role: 'Admin' }), false);
  assert.equal(hasMaintenanceAccess({ role: 'Operations', maintenance_portal_access: true }), true);
  assert.equal(hasMaintenanceAccess({ role: 'Admin', maintenance_portal_access: true }), true);
  assert.equal(hasMaintenanceAccess({ role: 'Admin', maintenance_portal_access: 'true' }), false);
});

test('Maintenance staff permissions use dedicated Maintenance assignments only', () => {
  const permissions = permissionsFromErpUser({
    role: 'Operations',
    can_view_all_entry: true,
    can_edit_all_entry: true,
    can_view_only_self_entry: false
  });
  assert.deepEqual(permissions, {
    create: false,
    updateOwn: false,
    viewAll: false,
    editAll: false
  });
});

test('Dedicated Maintenance permissions are returned independently', () => {
  const permissions = permissionsFromErpUser({
    role: 'Accountant',
    maintenance_can_create: true,
    maintenance_can_update_own: true,
    maintenance_can_view_all: false,
    maintenance_can_edit_all: false
  });
  assert.deepEqual(permissions, {
    create: true,
    updateOwn: true,
    viewAll: false,
    editAll: false
  });
});

test('Admin gets Maintenance CRUD permissions only after route-level explicit access succeeds', () => {
  const admin = { role: 'Administrator', maintenance_portal_access: true };
  assert.equal(hasMaintenanceAccess(admin), true);
  assert.deepEqual(permissionsFromErpUser(admin), {
    create: true,
    updateOwn: true,
    viewAll: true,
    editAll: true
  });
});
