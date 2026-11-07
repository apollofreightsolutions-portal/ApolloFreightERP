'use strict';

function hasMaintenanceAccess(row) {
  return row?.maintenance_portal_access === true;
}

function normalizeRole(role) {
  const value = String(role || '').trim().toLowerCase();
  if (value === 'admin' || value === 'administrator') return 'admin';
  if (value === 'accountant' || value === 'accounts') return 'accountant';
  return 'staff';
}

function permissionsFromErpUser(row) {
  const isAdmin = normalizeRole(row?.role) === 'admin';
  return {
    create: isAdmin || row?.maintenance_can_create === true,
    updateOwn: isAdmin || row?.maintenance_can_update_own === true,
    viewAll: isAdmin || row?.maintenance_can_view_all === true,
    editAll: isAdmin || row?.maintenance_can_edit_all === true
  };
}

module.exports = { hasMaintenanceAccess, normalizeRole, permissionsFromErpUser };
