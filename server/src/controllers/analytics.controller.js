const analyticsService = require("../services/analytics.service");

const rangeOf = (req) => ({ from: req.query.from, to: req.query.to });

// GET /api/v1/analytics/overview
const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview(rangeOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/types
const getByType = async (req, res, next) => {
  try {
    const data = await analyticsService.getByType(rangeOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/severity
const getBySeverity = async (req, res, next) => {
  try {
    const data = await analyticsService.getBySeverity(rangeOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/response-time
const getResponseTime = async (req, res, next) => {
  try {
    const data = await analyticsService.getResponseTime(rangeOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/hotspots
const getHotspots = async (req, res, next) => {
  try {
    const data = await analyticsService.getHotspots(rangeOf(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/resources
const getResourceUtilization = async (req, res, next) => {
  try {
    res.json({ success: true, data: await analyticsService.getResourceUtilization() });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/shortages
const getShortages = async (req, res, next) => {
  try {
    res.json({ success: true, data: await analyticsService.getShortages() });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/export?from=&to=
const exportCsv = async (req, res, next) => {
  try {
    const csv = await analyticsService.exportIncidentsCsv(rangeOf(req));
    const safe = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "all");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="incidents_${safe(req.query.from)}_${safe(req.query.to)}.csv"`);
    res.send("\ufeff" + csv);
  } catch (err) {
    next(err);
  }
};

module.exports = { getShortages, exportCsv, getResourceUtilization, getOverview, getByType, getBySeverity, getResponseTime, getHotspots };
