const { Router } = require("express");
const healthRouter = Router();
healthRouter.get("/", (_req, res) => res.json({ status: "healthy", checkedAt: new Date().toISOString() }));
module.exports = { healthRouter };
