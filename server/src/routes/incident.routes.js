const router = require("express").Router();
const ctrl = require("../controllers/incident.controller");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

// Create incident — citizen or optional auth
router.post("/", optionalAuth, ctrl.createIncident);

// List incidents — operator/admin/responder
router.get("/", requireAuth, requireRole("operator", "admin", "responder"), ctrl.getIncidents);

// Get single incident — any authenticated or citizen tracking own
router.get("/:id", optionalAuth, ctrl.getIncident); // staff get full record, everyone else a public tracking view

// Update incident — operator/admin
router.patch("/:id", requireAuth, requireRole("operator", "admin"), ctrl.updateIncident);

// Classify incident
router.post("/:id/classify", requireAuth, requireRole("operator", "admin"), ctrl.classifyIncident);

// Merge incident
router.post("/:id/merge", requireAuth, requireRole("operator", "admin"), ctrl.mergeIncident);

// Assign resources
router.post("/:id/assign", requireAuth, requireRole("operator", "admin"), ctrl.assignIncident);

// One-click dispatch of the recommended package, recall (override), dismiss as false report
router.post("/:id/auto-dispatch", requireAuth, requireRole("operator", "admin"), ctrl.autoDispatchIncident);
router.post("/:id/recall", requireAuth, requireRole("operator", "admin"), ctrl.recallIncident);
router.post("/:id/dismiss", requireAuth, requireRole("operator", "admin"), ctrl.dismissIncident);

router.get("/:id/report", requireAuth, requireRole("operator", "admin"), ctrl.getReport);

// Escalate
router.post("/:id/escalate", requireAuth, requireRole("operator", "admin"), ctrl.escalateIncident);

// Resolve
router.post("/:id/resolve", requireAuth, requireRole("operator", "admin", "responder"), ctrl.resolveIncident);

// Status update (command staff or the assigned responder — checked in the controller)
router.post("/:id/status", requireAuth, requireRole("operator", "admin", "responder"), ctrl.updateStatus);

// Responder accepts assignment
router.post("/:id/accept", requireAuth, requireRole("operator", "admin", "responder"), ctrl.acceptAssignment);

// Duplicate handling
router.post("/:id/reject-duplicate", requireAuth, requireRole("operator", "admin"), ctrl.rejectDuplicate);
router.post("/:id/unmerge", requireAuth, requireRole("operator", "admin"), ctrl.unmergeIncident);

// Regenerate AI summary
router.post("/:id/summary", requireAuth, requireRole("operator", "admin"), ctrl.regenerateSummary);

module.exports = router;
