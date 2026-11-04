'use strict';

const crypto = require('crypto');

// A short fingerprint of the stored password hash. Unlike updated_at it does NOT change on
// last_login updates or by the customer_users updated_at trigger, so a normal login stays valid,
// but a password change (by the customer or by ERP staff) revokes every older token.
function passwordVersion(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 24);
}

function timestampMillis(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameText(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function createRequireCustomerPortalAuth({ query, verifyToken }) {
  return async function requireCustomerPortalAuth(request, response, next) {
    const authorization = String(request.headers.authorization || '').trim();
    const token = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : String(request.headers['x-customer-token'] || request.headers['x-portal-token'] || '').trim();
    const session = verifyToken(token);
    const customerUserId = Number(session?.customerUserId);

    if (!session || session.portal !== 'customer' || !Number.isSafeInteger(customerUserId) || customerUserId <= 0) {
      return response.status(401).json({ ok: false, error: 'Customer login required.' });
    }

    try {
      const result = await query(
        `select cu.id, cu.customer_code, cu.username, cu.email, cu.status, cu.password_hash,
                c.name as customer_name, c.branch as customer_branch, c.status as customer_status
         from customer_users cu
         left join customers c on lower(c.code) = lower(cu.customer_code)
         where cu.id = $1
         limit 1`,
        [customerUserId]
      );
      const account = result.rows?.[0];
      const userActive = String(account?.status || '').trim().toLowerCase() === 'active';
      const customerActive = account?.customer_status === null || account?.customer_status === undefined
        || String(account.customer_status).trim().toLowerCase() === 'active';
      const sameIdentity = account
        && sameText(session.userName, account.username)
        && sameText(session.customerCode, account.customer_code);
      const currentStateMatches = account
        && typeof session.passwordVersion === 'string'
        && session.passwordVersion === passwordVersion(account.password_hash);

      if (!account || !userActive || !customerActive || !sameIdentity || !currentStateMatches) {
        return response.status(401).json({ ok: false, error: 'Customer session expired. Please sign in again.' });
      }

      request.customerSession = {
        ...session,
        customerUserId: String(account.id),
        customerCode: String(account.customer_code || '').trim(),
        customerName: String(account.customer_name || '').trim(),
        userName: String(account.username || '').trim(),
        email: String(account.email || '').trim(),
        status: String(account.status || '').toUpperCase(),
        branchAccess: String(account.customer_branch || 'Customer Portal').trim() || 'Customer Portal'
      };
      return next();
    } catch (_error) {
      return response.status(503).json({ ok: false, error: 'Customer authentication is temporarily unavailable.' });
    }
  };
}

module.exports = { createRequireCustomerPortalAuth, passwordVersion, timestampMillis };
