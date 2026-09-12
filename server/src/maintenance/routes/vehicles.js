const { Router } = require("express");
const crypto = require("crypto");
const { query } = require("../../db");
const { canCreate, canDelete, canEditAll, canUpdateOwn, requireAuth } = require("../middleware/auth");

const vehiclesRouter = Router();
module.exports = { vehiclesRouter };

vehiclesRouter.get("/", requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT v.id, v.name, v.plate_number, v.type, v.driver_name, v.route_name, v.status,
              v.created_at, v.updated_at, v.created_by,
              u.user_name AS created_by_name, u.user_name AS created_by_username
       FROM maintenance_vehicles v
       LEFT JOIN app_users u ON u.id = v.created_by
       ORDER BY v.created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

vehiclesRouter.post("/", requireAuth, async (req, res) => {
  try {
    if (!canCreate(req)) return res.status(403).json({ message: "Forbidden." });
    const { name, plateNumber, type, driverName, routeName, status } = req.body;
    const id = crypto.randomUUID();

    const result = await query(
      `INSERT INTO maintenance_vehicles (id, name, plate_number, type, driver_name, route_name, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, plate_number, type, driver_name, route_name, status, created_at, updated_at, created_by`,
      [id, name, plateNumber, type, driverName || null, routeName || null, status, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

vehiclesRouter.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, plateNumber, type, driverName, routeName, status } = req.body;

    const before = await query(
      `SELECT id, name, plate_number, type, driver_name, route_name, status, created_at, updated_at, created_by
       FROM maintenance_vehicles
       WHERE id = $1`,
      [id]
    );
    if (before.rowCount === 0) {
      return res.status(404).json({ message: "Vehicle not found." });
    }
    const ownerId = before.rows[0].created_by;
    const allowed = canEditAll(req) || (canUpdateOwn(req) && ownerId === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Forbidden." });

    const result = await query(
      `UPDATE maintenance_vehicles
       SET name = $2,
           plate_number = $3,
           type = $4,
           driver_name = $5,
           route_name = $6,
           status = $7,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, plate_number, type, driver_name, route_name, status, created_at, updated_at, created_by`,
      [id, name, plateNumber, type, driverName || null, routeName || null, status]
    );

    await query(
      `INSERT INTO maintenance_vehicle_history (id, vehicle_id, old_row, new_row)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), id, before.rows[0], result.rows[0]]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

vehiclesRouter.get("/:id/history", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, changed_at, old_row, new_row
       FROM maintenance_vehicle_history
       WHERE vehicle_id = $1
       ORDER BY changed_at DESC
       LIMIT 50`,
      [id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

vehiclesRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await query("SELECT id, created_by FROM maintenance_vehicles WHERE id = $1", [id]);
    if (before.rowCount === 0) return res.status(404).json({ message: "Vehicle not found." });
    if (!canDelete(req)) return res.status(403).json({ message: "Forbidden." });
    const ownerId = before.rows[0].created_by;
    const allowed = canEditAll(req) || (canUpdateOwn(req) && ownerId === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Forbidden." });

    const result = await query("DELETE FROM maintenance_vehicles WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Vehicle not found." });
    }

    return res.json({ message: "Vehicle deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
