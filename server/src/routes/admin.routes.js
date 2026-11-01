const router = require("express").Router();
const ctrl = require("../controllers/admin.controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

router.get("/config", ctrl.getConfig);
router.put("/config", ctrl.updateConfig);

router.get("/users", ctrl.listUsers);
router.post("/users", ctrl.createUser);
router.patch("/users/:id", ctrl.updateUser);

module.exports = router;
