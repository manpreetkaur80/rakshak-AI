const router = require("express").Router();
const ctrl = require("../controllers/incident.controller");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

// Create incident — citizen or optional auth
router.post("/", optionalAuth, ctrl.createIncident);

// List incidents — operator/admin/responder
router.get("/", requireAuth, requireRole("operator", "admin", "responder"), ctrl.getIncidents);

// Get single incident — any authenticated or citizen tracking own
router.get("/:id", optionalAuth, ctrl.getIncident);

// Update incident — operator/admin
router.patch("/:id", requireAuth, requireRole("operator", "admin"), ctrl.updateIncident);

// Classify incident
router.post("/:id/classify", requireAuth, requireRole("operator", "admin"), ctrl.classifyIncident);

// Merge incident
router.post("/:id/merge", requireAuth, requireRole("operator", "admin"), ctrl.mergeIncident);

// Assign resources
router.post("/:id/assign", requireAuth, requireRole("operator", "admin"), ctrl.assignIncident);

// Escalate
router.post("/:id/escalate", requireAuth, requireRole("operator", "admin"), ctrl.escalateIncident);

// Resolve
router.post("/:id/resolve", requireAuth, requireRole("operator", "admin", "responder"), ctrl.resolveIncident);

// Status update (responder)
router.post("/:id/status", requireAuth, ctrl.updateStatus);

module.exports = router;
