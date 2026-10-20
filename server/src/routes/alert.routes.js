const router = require("express").Router();
const ctrl = require("../controllers/alert.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/", requireAuth, requireRole("operator", "admin"), ctrl.getAlerts);
router.patch("/:id/acknowledge", requireAuth, requireRole("operator", "admin"), ctrl.acknowledgeAlert);

module.exports = router;
