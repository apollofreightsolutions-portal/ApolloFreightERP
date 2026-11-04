'use strict';

function booleanValue(value) {
  return value === true || value === 1 || ['true', 't', '1', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function createCurrentAppSessionResolver(query) {
  if (typeof query !== 'function') {
    throw new TypeError('A database query function is required.');
  }

  return async function resolveCurrentAppSession(session) {
    const userName = String(session?.userName || '').trim();
    if (!userName) return null;

    let result;
    try {
      result = await query(
        `select role, is_hr_admin, account_status, auth_session_version,
                branch_access, branch_view_scope, can_view_all_entry, can_view_only_self_entry,
                can_edit_all_entry, can_billing_sales_entry, can_billing_cost_entry
         from app_users
         where lower(user_name) = lower($1)
         limit 1`,
        [userName]
      );
    } catch (error) {
      // Preserve compatibility with databases before the additive session-version migration.
      // All permission fields used by S3/S7 are still refreshed from the database on this path.
      if (error?.code !== '42703') throw error;
      result = await query(
        `select role, is_hr_admin, account_status,
                branch_access, branch_view_scope, can_view_all_entry, can_view_only_self_entry,
                can_edit_all_entry, can_billing_sales_entry, can_billing_cost_entry
         from app_users
         where lower(user_name) = lower($1)
         limit 1`,
        [userName]
      );
    }

    const row = result.rows?.[0];
    if (!row || String(row.account_status || 'Active').trim().toLowerCase() !== 'active') {
      return null;
    }

    const databaseVersion = Number(row.auth_session_version || 0);
    if (Number(session.authSessionVersion || 0) !== databaseVersion) return null;

    return {
      ...session,
      // Authorization claims are always overwritten from current database state.
      role: String(row.role || 'Staff'),
      isHrAdmin: booleanValue(row.is_hr_admin),
      authSessionVersion: databaseVersion,
      branchAccess: String(row.branch_access || 'Kuwait HO'),
      branchViewScope: String(row.branch_view_scope || 'Assigned Branch Only'),
      canViewAllEntry: booleanValue(row.can_view_all_entry),
      canViewOnlySelfEntry: booleanValue(row.can_view_only_self_entry),
      canEditAllEntry: booleanValue(row.can_edit_all_entry),
      canBillingSalesEntry: booleanValue(row.can_billing_sales_entry),
      canBillingCostEntry: booleanValue(row.can_billing_cost_entry)
    };
  };
}

module.exports = { createCurrentAppSessionResolver };
