const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../../db");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { updatePasswordById } = require("../../session-revocation");
const { permissionsFromErpUser } = require("../permissions");

const usersRouter = Router();
module.exports = { usersRouter };

function erpRole(role) {
  const value = String(role || "Operations").trim().toLowerCase();
  if (value === "admin" || value === "administrator") return "Admin";
  if (value === "accountant" || value === "accounts") return "Accountant";
  return "Operations";
}

function permissionsFor(row) {
  return permissionsFromErpUser(row);
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.user_name,
    username: row.user_name,
    email: row.email || "",
    role: row.role,
    account_status: row.account_status,
    created_at: row.created_at,
    permissions: permissionsFor(row),
    maintenance_portal_access: row.maintenance_portal_access === true
  };
}

const userColumns = `id, user_name, email, role, account_status, created_at,
  maintenance_portal_access, maintenance_can_create, maintenance_can_view_all,
  maintenance_can_update_own, maintenance_can_edit_all`;

usersRouter.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const result = await query(`SELECT ${userColumns} FROM app_users ORDER BY created_at DESC`);
    res.json(result.rows.map(publicUser));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

usersRouter.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || req.body.username || "").trim();
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !username || !password) {
      return res.status(400).json({ message: "Name, username, and password are required." });
    }

    const permissions = req.body.permissions || {};
    const maintenanceAccess = req.body.maintenancePortalAccess === true || req.body.maintenance_portal_access === true || permissions.access === true;
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO app_users
         (user_name, email, role, password, can_view_all_entry, can_view_only_self_entry,
          can_edit_all_entry, can_view_updated_history, maintenance_portal_access,
          maintenance_can_create, maintenance_can_view_all, maintenance_can_update_own, maintenance_can_edit_all)
       VALUES ($1, $2, $3, $4, false, true, false, false, $5, $6, $7, $8, $9)
       RETURNING ${userColumns}`,
      [
        username,
        email,
        erpRole(req.body.role),
        passwordHash,
        maintenanceAccess,
        Boolean(permissions.create),
        Boolean(permissions.viewAll),
        Boolean(permissions.updateOwn),
        Boolean(permissions.editAll)
      ]
    );
    res.status(201).json(publicUser(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

usersRouter.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!Number.isInteger(id) || !username) return res.status(400).json({ message: "A valid username is required." });
    const permissions = req.body.permissions || {};
    const maintenanceAccess = req.body.maintenancePortalAccess === true || req.body.maintenance_portal_access === true || permissions.access === true;
    const result = await query(
      `UPDATE app_users
       SET user_name = $2,
           email = $3,
           role = $4,
           maintenance_portal_access = $5,
           maintenance_can_create = $6,
           maintenance_can_view_all = $7,
           maintenance_can_update_own = $8,
           maintenance_can_edit_all = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${userColumns}`,
      [id, username, email, erpRole(req.body.role), maintenanceAccess, Boolean(permissions.create), Boolean(permissions.viewAll), Boolean(permissions.updateOwn), Boolean(permissions.editAll)]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "User not found." });
    return res.json(publicUser(result.rows[0]));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

usersRouter.put("/:id/password", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const password = String(req.body.password || "");
    if (!Number.isInteger(id) || !password) return res.status(400).json({ message: "A valid user and password are required." });
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await updatePasswordById(query, id, passwordHash);
    if (result.rowCount === 0) return res.status(404).json({ message: "User not found." });
    return res.json({ ...result.rows[0], name: result.rows[0].user_name, username: result.rows[0].user_name });
  } catch (error) {
    if (error?.code === "42703") {
      return res.status(503).json({ message: "Password changes are unavailable until the session-revocation database migration is applied." });
    }
    return res.status(500).json({ message: error.message });
  }
});

usersRouter.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === Number(req.user?.id)) return res.status(400).json({ message: "You cannot revoke your own Maintenance access here." });
    const result = await query(
      `UPDATE app_users
       SET maintenance_portal_access = false,
           maintenance_can_create = false,
           maintenance_can_view_all = false,
           maintenance_can_update_own = false,
           maintenance_can_edit_all = false,
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${userColumns}`,
      [id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: "User not found." });
    return res.json(publicUser(result.rows[0]));
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
