const router = require("express").Router();
const ctrl = require("../controllers/resource.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

// IMPORTANT: specific routes before :id
router.get("/recommendations/:incidentId", requireAuth, requireRole("operator", "admin"), ctrl.getRecommendationsForIncident);
router.post("/seed", requireAuth, requireRole("admin"), ctrl.seedResources);

router.get("/", requireAuth, requireRole("operator", "admin", "responder"), ctrl.getResources);
router.get("/:id", requireAuth, requireRole("operator", "admin", "responder"), ctrl.getResource);
router.patch("/:id/status", requireAuth, requireRole("operator", "admin", "responder"), ctrl.updateResourceStatus);

module.exports = router;
