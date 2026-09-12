const { Router } = require("express");
const { requireAuth } = require("../middleware/auth");

const authRouter = Router();
module.exports = { authRouter };

// Maintenance no longer owns credentials. ERP is the single login authority.
authRouter.post("/login", (_req, res) => {
  res.status(410).json({ message: "Maintenance login has been retired. Sign in to ERP and open Maintenance Portal." });
});

authRouter.post("/forgot-password", (_req, res) => {
  res.status(410).json({ message: "Password management is handled by the ERP portal." });
});

authRouter.post("/reset-password", (_req, res) => {
  res.status(410).json({ message: "Password management is handled by the ERP portal." });
});

authRouter.get("/me", requireAuth, (req, res) => {
  return res.json({
    id: req.user.id,
    name: req.user.name,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    permissions: req.user.permissions,
    created_at: null
  });
});
