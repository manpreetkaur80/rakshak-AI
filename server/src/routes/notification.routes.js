const router = require("express").Router();
const ctrl = require("../controllers/notification.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth);

// specific routes before :id
router.get("/preferences", ctrl.getPreferences);
router.patch("/preferences", ctrl.updatePreferences);
router.get("/log", requireRole("admin"), ctrl.log);
router.post("/test", requireRole("admin"), ctrl.test);
router.post("/read-all", ctrl.markAllRead);

router.get("/", ctrl.list);
router.patch("/:id/read", ctrl.markRead);

module.exports = router;
