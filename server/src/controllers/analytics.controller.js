const analyticsService = require("../services/analytics.service");

// GET /api/v1/analytics/overview
const getOverview = async (req, res, next) => {
  try {
    const data = await analyticsService.getOverview();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/types
const getByType = async (req, res, next) => {
  try {
    const data = await analyticsService.getByType();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/severity
const getBySeverity = async (req, res, next) => {
  try {
    const data = await analyticsService.getBySeverity();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/response-time
const getResponseTime = async (req, res, next) => {
  try {
    const data = await analyticsService.getResponseTime();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/analytics/hotspots
const getHotspots = async (req, res, next) => {
  try {
    const data = await analyticsService.getHotspots();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = { getOverview, getByType, getBySeverity, getResponseTime, getHotspots };
