const Resource = require("../models/Resource");
const { getRecommendations, missingTypes } = require("../services/resource.service");
const Alert = require("../models/Alert");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { createAlert } = require("../services/alert.service");

let io = null;
function setIO(socketIO) { io = socketIO; }

// GET /api/v1/resources
const getResources = async (req, res, next) => {
  try {
    const { type, status } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const resources = await Resource.find(filter)
      .populate("currentIncident", "publicId type severity status")
      .sort({ type: 1, publicId: 1 });

    res.json({ success: true, data: resources });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/resources/:id
const getResource = async (req, res, next) => {
  try {
    const resource = await Resource.findOne({
      $or: [
        { publicId: req.params.id },
        { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
      ],
    }).populate("currentIncident", "publicId type severity status");

    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found", code: "RESOURCE_NOT_FOUND" });
    }
    res.json({ success: true, data: resource });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/resources/:id/status
const updateResourceStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const VALID_STATUSES = ["available", "assigned", "en_route", "on_scene", "unavailable", "maintenance"];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid resource status", code: "VALIDATION_ERROR" });
    }

    const resource = await Resource.findOne({
      $or: [{ publicId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
    });
    if (!resource) {
      return res.status(404).json({ success: false, message: "Resource not found", code: "RESOURCE_NOT_FOUND" });
    }

    if (req.user.role === "responder" && String(resource.responderUser) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "You can only update your own unit", code: "FORBIDDEN" });
    }

    resource.status = status;
    resource.availability.isAvailable = status === "available";
    resource.availability.lastUpdated = new Date();
    if (status === "available") resource.currentIncident = null;
    await resource.save();

    if (io) io.emit("resource:updated", { resourceId: resource.publicId, status });

    res.json({ success: true, data: { publicId: resource.publicId, status } });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/resources/recommendations/:incidentId
const getRecommendationsForIncident = async (req, res, next) => {
  try {
    const Incident = require("../models/Incident");
    const incident = await Incident.findOne({ publicId: req.params.incidentId });
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const recommendations = await getRecommendations(incident);

    // Resource shortage: the response package needs a unit type that nobody has available
    const missing = ["RESOLVED", "CLOSED", "MERGED"].includes(incident.status) ? [] : missingTypes(incident, recommendations);
    const typeLabel = (t) => t.replace("_", " ");
    for (const t of missing) {
      const message = `No available ${typeLabel(t)} unit for ${incident.publicId} (${incident.type}, ${incident.priority}).`;
      const already = await Alert.exists({ type: "resource_shortage", incidentId: incident._id, message, isAcknowledged: false });
      if (already) continue;
      const alert = await createAlert({ type: "resource_shortage", severity: incident.priority === "P1" ? "critical" : "warning", title: `Resource shortage — ${typeLabel(t)}`, message, incidentId: incident._id });
      await AnalyticsEvent.create({ eventType: "resource_shortage", incidentId: incident._id, metadata: { resourceType: t, priority: incident.priority } });
      if (io) io.emit("alert:created", { id: alert._id, publicId: alert.publicId, type: alert.type, severity: alert.severity, title: alert.title, message: alert.message, incidentId: incident.publicId, acknowledged: false });
    }

    const formatted = recommendations.map((r) => ({
      resourceId: r.resource.publicId,
      _id: r.resource._id,
      name: r.resource.name,
      type: r.resource.type,
      capabilities: r.resource.capabilities,
      matchScore: r.matchScore,
      distanceKm: r.distanceKm,
      etaMinutes: r.etaMinutes,
      status: r.resource.status,
      location: r.resource.location,
      capabilityScore: r.capabilityScore,
      distanceScore: r.distanceScore,
      role: r.role,
      reason: r.reason,
    }));

    res.json({ success: true, data: formatted, meta: { missing } });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/resources/seed
const seedResources = async (req, res, next) => {
  try {
    const existing = await Resource.countDocuments();
    if (existing > 0) {
      return res.json({ success: true, message: "Resources already seeded", data: { count: existing } });
    }

    const { seedResources: doSeed } = require("../seed/seedData");
    await doSeed();

    const count = await Resource.countDocuments();
    res.json({ success: true, data: { count, message: "Resources seeded successfully" } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getResources, getResource, updateResourceStatus, getRecommendationsForIncident, seedResources, setIO };
