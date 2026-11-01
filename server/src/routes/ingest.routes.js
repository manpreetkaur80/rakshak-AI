const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../controllers/ingest.controller");
const { requireAuth, requireRole, optionalAuth } = require("../middleware/auth");

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 10000 : 300,
  message: { success: false, message: "Too many ingest requests", code: "RATE_LIMIT" },
});

// Which signed-in roles may push which feed (the machine feeds use an API key instead)
const ROLE_FEEDS = { operator: "*", admin: "*", hospital: ["hospital"], responder: ["field"] };

function feedAuth(req, res, next) {
  if (ctrl.validApiKey(req.headers["x-api-key"])) return next();
  const allowed = req.user && ROLE_FEEDS[req.user.role];
  if (allowed === "*" || (Array.isArray(allowed) && allowed.includes(req.params.source))) return next();
  if (req.user) return res.status(403).json({ success: false, message: "Your role cannot push this feed", code: "FORBIDDEN" });
  return res.status(401).json({ success: false, message: "API key (x-api-key) or staff login required", code: "UNAUTHORIZED" });
}

router.get("/sources", requireAuth, requireRole("operator", "admin"), ctrl.sources);
router.post("/simulate", requireAuth, requireRole("operator", "admin"), ctrl.simulate);
router.post("/:source", limiter, optionalAuth, feedAuth, ctrl.ingest);

module.exports = router;
