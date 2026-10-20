const router = require("express").Router();
const ctrl = require("../controllers/demo.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/market-fire", requireAuth, requireRole("operator", "admin"), ctrl.startMarketFireSimulation);

module.exports = router;
