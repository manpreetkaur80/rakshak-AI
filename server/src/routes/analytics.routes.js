const router = require("express").Router();
const ctrl = require("../controllers/analytics.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/overview", requireAuth, requireRole("operator", "admin", "responder"), ctrl.getOverview);
router.get("/types", requireAuth, requireRole("operator", "admin"), ctrl.getByType);
router.get("/severity", requireAuth, requireRole("operator", "admin"), ctrl.getBySeverity);
router.get("/response-time", requireAuth, requireRole("operator", "admin"), ctrl.getResponseTime);
router.get("/resources", requireAuth, requireRole("operator", "admin"), ctrl.getResourceUtilization);
router.get("/shortages", requireAuth, requireRole("operator", "admin"), ctrl.getShortages);
router.get("/export", requireAuth, requireRole("operator", "admin"), ctrl.exportCsv);
router.get("/hotspots", requireAuth, requireRole("operator", "admin"), ctrl.getHotspots);

module.exports = router;
