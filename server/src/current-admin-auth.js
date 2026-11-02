'use strict';

function createRequireCurrentErpAdmin(query) {
  return async function requireCurrentErpAdmin(request, response, next) {
    const userName = String(request.appSession?.userName || '').trim();
    if (!userName || request.appSession?.employeePortal || request.appSession?.crmPortal) {
      return response.status(403).json({ ok: false, error: 'Admin access is required for this operation.' });
    }

    try {
      const result = await query(
        `select role, account_status
         from app_users
         where lower(user_name) = lower($1)
         limit 1`,
        [userName]
      );
      const user = result.rows?.[0];
      const isActive = String(user?.account_status || '').trim().toLowerCase() === 'active';
      const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
      if (!isActive || !isAdmin) {
        return response.status(403).json({ ok: false, error: 'Admin access is required for this operation.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { createRequireCurrentErpAdmin };
