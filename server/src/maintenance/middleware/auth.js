const crypto = require("crypto");
const { query } = require("../../db");
const { hasMaintenanceAccess, normalizeRole, permissionsFromErpUser } = require("../permissions");

let sharedPortalSecret = String(process.env.CUSTOMER_PORTAL_SECRET || process.env.SESSION_SECRET || process.env.API_SECRET || "").trim();

async function getSharedPortalSecret() {
  try {
    const result = await query("SELECT secret_value FROM system_secrets WHERE secret_key = $1 LIMIT 1", ["customer_portal_secret"]);
    const databaseSecret = String(result.rows[0]?.secret_value || "").trim();
    if (databaseSecret) {
      sharedPortalSecret = databaseSecret;
      return databaseSecret;
    }
  } catch (error) {
    console.warn("Unable to read ERP shared portal secret from database:", error.message);
  }
  return sharedPortalSecret;
}

async function verifyErpToken(token) {
  const value = String(token || "").trim();
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const secret = await getSharedPortalSecret();
  if (!secret) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const rawExp = Number(payload?.exp || 0);
    const expMs = rawExp > 0 && rawExp < 100000000000 ? rawExp * 1000 : rawExp;
    if (expMs > 0 && Date.now() > expMs) return null;
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ message: "ERP login is required." });
  try {
    const payload = await verifyErpToken(match[1]);
    const userName = String(payload?.userName || payload?.username || "").trim();
    if (!payload || !userName || payload.portal !== "app") return res.status(401).json({ message: "Use your ERP account to open Maintenance." });
    let result;
    try {
      result = await query(`SELECT id, user_name, email, role, account_status, auth_session_version, erp_portal_access, maintenance_portal_access, maintenance_can_create, maintenance_can_view_all, maintenance_can_update_own, maintenance_can_edit_all, can_view_updated_history FROM app_users WHERE LOWER(TRIM(user_name)) = LOWER($1) LIMIT 1`, [userName]);
    } catch (error) {
      if (error?.code !== "42703") throw error;
      // Older databases may not have auth_session_version, but new Maintenance
      // permission columns remain mandatory: an incomplete migration fails closed.
      result = await query(`SELECT id, user_name, email, role, account_status, erp_portal_access, maintenance_portal_access, maintenance_can_create, maintenance_can_view_all, maintenance_can_update_own, maintenance_can_edit_all, can_view_updated_history FROM app_users WHERE LOWER(TRIM(user_name)) = LOWER($1) LIMIT 1`, [userName]);
    }
    const row = result.rows[0];
    if (!row || String(row.account_status || "Active").toLowerCase() !== "active") return res.status(403).json({ message: "Your ERP account is not active." });
    if (Number(payload.authSessionVersion || 0) !== Number(row.auth_session_version || 0)) return res.status(401).json({ message: "ERP session expired. Please sign in again." });
    if (!hasMaintenanceAccess(row)) {
      return res.status(403).json({ message: "Maintenance Portal access is not enabled for this ERP account." });
    }
    req.user = { id: row.id, name: row.user_name, username: row.user_name, email: row.email || "", role: normalizeRole(row.role), permissions: permissionsFromErpUser(row), erpRole: row.role, erpPortalAccess: row.erp_portal_access !== false, maintenancePortalAccess: true, canViewUpdatedHistory: row.can_view_updated_history === true };
    return next();
  } catch (error) {
    console.error("ERP auth lookup failed:", error);
    return res.status(401).json({ message: "ERP session expired. Please return to ERP and open Maintenance again." });
  }
}

function requireAdmin(req, res, next) { if (req.user?.role === "admin") return next(); return res.status(403).json({ message: "Forbidden." }); }
function canViewAll(req) { return Boolean(req.user?.permissions?.viewAll || req.user?.permissions?.editAll); }
function canEditAll(req) { return Boolean(req.user?.role === "admin" || req.user?.permissions?.editAll); }
function canCreate(req) { return Boolean(req.user?.permissions?.create || req.user?.role === "admin"); }
function canUpdateOwn(req) { return Boolean(req.user?.permissions?.updateOwn || req.user?.role === "admin"); }
function canDelete(req) { return Boolean(req.user?.role === "admin" || req.user?.permissions?.editAll); }
module.exports = { requireAuth, requireAdmin, canViewAll, canEditAll, canCreate, canUpdateOwn, canDelete };
