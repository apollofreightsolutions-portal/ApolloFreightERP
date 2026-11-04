'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCurrentAppSessionResolver } = require('../src/current-app-session');

function row(overrides = {}) {
  return {
    role: 'Operations',
    is_hr_admin: false,
    account_status: 'Active',
    auth_session_version: 4,
    branch_access: 'Kuwait HO',
    branch_view_scope: 'Assigned Branch Only',
    can_view_all_entry: false,
    can_view_only_self_entry: true,
    can_edit_all_entry: false,
    can_billing_sales_entry: false,
    can_billing_cost_entry: false,
    ...overrides
  };
}

test('current database role and HR-admin flag override stale token authorization claims', async () => {
  let queryArgs;
  const resolve = createCurrentAppSessionResolver(async (...args) => {
    queryArgs = args;
    return { rows: [row({ role: 'Staff', is_hr_admin: false })] };
  });
  const tokenSession = {
    userName: 'alice', role: 'Admin', isHrAdmin: true, authSessionVersion: 4,
    employeePortal: true, branchAccess: 'Both'
  };

  const refreshed = await resolve(tokenSession);

  assert.equal(refreshed.role, 'Staff');
  assert.equal(refreshed.isHrAdmin, false);
  assert.equal(refreshed.authSessionVersion, 4);
  assert.equal(refreshed.employeePortal, true);
  assert.equal(refreshed.branchAccess, 'Kuwait HO');
  assert.match(queryArgs[0], /select role, is_hr_admin, account_status, auth_session_version/i);
  assert.deepEqual(queryArgs[1], ['alice']);
});

test('current database branch, entry-scope, and billing flags override stale token claims', async () => {
  const resolve = createCurrentAppSessionResolver(async () => ({
    rows: [row({
      branch_access: 'Dubai', branch_view_scope: 'Assigned Branch Only',
      can_view_all_entry: false, can_view_only_self_entry: true,
      can_billing_sales_entry: false, can_billing_cost_entry: false
    })]
  }));
  const refreshed = await resolve({
    userName: 'alice', role: 'Operations', authSessionVersion: 4,
    branchAccess: 'Both', branchViewScope: 'All Branches',
    canViewAllEntry: true, canViewOnlySelfEntry: false,
    canBillingSalesEntry: true, canBillingCostEntry: true
  });

  assert.equal(refreshed.branchAccess, 'Dubai');
  assert.equal(refreshed.branchViewScope, 'Assigned Branch Only');
  assert.equal(refreshed.canViewAllEntry, false);
  assert.equal(refreshed.canViewOnlySelfEntry, true);
  assert.equal(refreshed.canBillingSalesEntry, false);
  assert.equal(refreshed.canBillingCostEntry, false);
});

test('current database promotion and HR-admin grant apply without changing portal identity', async () => {
  const resolve = createCurrentAppSessionResolver(async () => ({
    rows: [row({ role: 'Admin', is_hr_admin: true })]
  }));
  const refreshed = await resolve({
    userName: 'alice', role: 'Staff', isHrAdmin: false,
    authSessionVersion: 4, crmPortal: true
  });

  assert.equal(refreshed.role, 'Admin');
  assert.equal(refreshed.isHrAdmin, true);
  assert.equal(refreshed.crmPortal, true);
});

test('inactive, missing, or session-version-mismatched users are rejected', async () => {
  for (const rows of [
    [],
    [row({ account_status: 'Disabled' })],
    [row({ auth_session_version: 5 })]
  ]) {
    const resolve = createCurrentAppSessionResolver(async () => ({ rows }));
    assert.equal(await resolve({ userName: 'alice', authSessionVersion: 4 }), null);
  }
});

test('legacy schema fallback still refreshes current role and permission claims', async () => {
  let calls = 0;
  const resolve = createCurrentAppSessionResolver(async (sql) => {
    calls += 1;
    if (calls === 1) {
      const error = new Error('column auth_session_version does not exist');
      error.code = '42703';
      throw error;
    }
    assert.doesNotMatch(sql, /auth_session_version/i);
    return { rows: [row({ role: 'HR', is_hr_admin: true, auth_session_version: undefined, branch_access: 'Dubai' })] };
  });

  const refreshed = await resolve({ userName: 'alice', authSessionVersion: 0, role: 'Staff' });

  assert.equal(calls, 2);
  assert.equal(refreshed.role, 'HR');
  assert.equal(refreshed.isHrAdmin, true);
  assert.equal(refreshed.branchAccess, 'Dubai');
});

test('database lookup failures are propagated and do not preserve stale authorization claims', async () => {
  const databaseError = new Error('database unavailable');
  const resolve = createCurrentAppSessionResolver(async () => { throw databaseError; });

  await assert.rejects(
    resolve({ userName: 'alice', authSessionVersion: 4, role: 'Admin', isHrAdmin: true }),
    (error) => error === databaseError
  );
});
