const { Router } = require("express");
const crypto = require("crypto");
const { query } = require("../../db");
const { canCreate, canDelete, canEditAll, canUpdateOwn, canViewAll, requireAuth } = require("../middleware/auth");

const expensesRouter = Router();
module.exports = { expensesRouter };

expensesRouter.get("/", requireAuth, async (req, res) => {
  try {
    const showAll = canViewAll(req);
    const result = showAll
      ? await query(
          `SELECT e.id, e.vehicle_id, e.type, e.amount, e.currency, e.expense_date, e.notes, e.paid_status,
                  e.created_at, e.updated_at, e.created_by,
                  u.user_name AS created_by_name, u.user_name AS created_by_username
           FROM maintenance_expenses e
           LEFT JOIN app_users u ON u.id = e.created_by
           ORDER BY e.created_at DESC`
        )
      : await query(
          `SELECT e.id, e.vehicle_id, e.type, e.amount, e.currency, e.expense_date, e.notes, e.paid_status,
                  e.created_at, e.updated_at, e.created_by,
                  u.user_name AS created_by_name, u.user_name AS created_by_username
           FROM maintenance_expenses e
           LEFT JOIN app_users u ON u.id = e.created_by
           WHERE e.created_by = $1
           ORDER BY e.created_at DESC`,
          [req.user.id]
        );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

expensesRouter.post("/", requireAuth, async (req, res) => {
  try {
    if (!canCreate(req)) return res.status(403).json({ message: "Forbidden." });
    const { vehicleId, type, amount, currency, expenseDate, notes, paidStatus } = req.body;
    const id = crypto.randomUUID();

    const result = await query(
      `INSERT INTO maintenance_expenses (id, vehicle_id, type, amount, currency, expense_date, notes, paid_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, vehicle_id, type, amount, currency, expense_date, notes, paid_status, created_at, updated_at, created_by`,
      [id, vehicleId, type, amount, currency, expenseDate, notes || null, paidStatus || "unpaid", req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

expensesRouter.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { vehicleId, type, amount, currency, expenseDate, notes, paidStatus } = req.body;

    const before = await query(
      `SELECT id, vehicle_id, type, amount, currency, expense_date, notes, paid_status, created_at, updated_at, created_by
       FROM maintenance_expenses
       WHERE id = $1`,
      [id]
    );
    if (before.rowCount === 0) {
      return res.status(404).json({ message: "Expense not found." });
    }
    const ownerId = before.rows[0].created_by;
    const allowed = canEditAll(req) || (canUpdateOwn(req) && ownerId === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Forbidden." });

    const result = await query(
      `UPDATE maintenance_expenses
       SET vehicle_id = $2,
           type = $3,
           amount = $4,
           currency = $5,
           expense_date = $6,
           notes = $7,
           paid_status = $8,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, vehicle_id, type, amount, currency, expense_date, notes, paid_status, created_at, updated_at, created_by`,
      [id, vehicleId, type, amount, currency, expenseDate, notes || null, paidStatus || before.rows[0].paid_status]
    );

    await query(
      `INSERT INTO maintenance_expense_history (id, expense_id, old_row, new_row)
       VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), id, before.rows[0], result.rows[0]]
    );

    return res.json(result.rows[0]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

expensesRouter.get("/:id/history", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT id, changed_at, old_row, new_row
       FROM maintenance_expense_history
       WHERE expense_id = $1
       ORDER BY changed_at DESC
       LIMIT 50`,
      [id]
    );
    return res.json(result.rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

expensesRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const before = await query("SELECT id, created_by FROM maintenance_expenses WHERE id = $1", [id]);
    if (before.rowCount === 0) return res.status(404).json({ message: "Expense not found." });
    if (!canDelete(req)) return res.status(403).json({ message: "Forbidden." });
    const ownerId = before.rows[0].created_by;
    const allowed = canEditAll(req) || (canUpdateOwn(req) && ownerId === req.user.id);
    if (!allowed) return res.status(403).json({ message: "Forbidden." });

    const result = await query("DELETE FROM maintenance_expenses WHERE id = $1 RETURNING id", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Expense not found." });
    }

    return res.json({ message: "Expense deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
