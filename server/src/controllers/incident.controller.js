const Incident = require("../models/Incident");
const SourceReport = require("../models/SourceReport");
const Resource = require("../models/Resource");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { classify } = require("../services/ai.service");
const { findDuplicateCandidates } = require("../services/duplicate.service");
const { createAlert } = require("../services/alert.service");

let io = null;
function setIO(socketIO) { io = socketIO; }

function emit(event, data) {
  if (io) io.emit(event, data);
}

// Valid status transitions
const VALID_TRANSITIONS = {
  REPORTED: ["CLASSIFIED", "DUPLICATE_CANDIDATE"],
  CLASSIFIED: ["ASSIGNED", "DUPLICATE_CANDIDATE"],
  ASSIGNED: ["EN_ROUTE", "RESOLVED"],
  EN_ROUTE: ["ON_SCENE", "RESOLVED"],
  ON_SCENE: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  DUPLICATE_CANDIDATE: ["MERGED", "CLASSIFIED"],
  MERGED: [],
  CLOSED: [],
};

// POST /api/v1/incidents
const createIncident = async (req, res, next) => {
  try {
    const { type, description, location, address, imageUrl } = req.body;

    if (!description) {
      return res.status(400).json({ success: false, message: "Description is required", code: "VALIDATION_ERROR" });
    }
    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({ success: false, message: "Valid location with coordinates [longitude, latitude] is required", code: "VALIDATION_ERROR" });
    }

    const reportedBy = req.user ? req.user._id : null;

    // Create source report
    const sourceReport = await SourceReport.create({
      reportedBy: reportedBy || (await require("../models/User").findOne({ role: "citizen" }))?._id,
      description,
      typeHint: type || "",
      location,
      address: address || "",
      imageUrl: imageUrl || null,
      metadata: { source: "web" },
    });

    // Run AI classification
    let aiResult = null;
    try {
      aiResult = await classify(description, type || "");
    } catch (err) {
      console.error("Classification failed:", err.message);
    }

    const title = `${(type || (aiResult && aiResult.type) || "Emergency").charAt(0).toUpperCase() + (type || (aiResult && aiResult.type) || "emergency").slice(1)} reported near ${address || "location"}`;

    // Create incident
    const incident = await Incident.create({
      type: (aiResult && aiResult.type) || type || "other",
      severity: (aiResult && aiResult.severity) || "medium",
      priority: (aiResult && aiResult.priority) || "P3",
      status: "REPORTED",
      title,
      description,
      location,
      address: address || "",
      imageUrl: imageUrl || null,
      sourceReports: [sourceReport._id],
      aiClassification: aiResult ? {
        type: aiResult.type,
        severity: aiResult.severity,
        priority: aiResult.priority,
        confidence: aiResult.confidence,
        summary: aiResult.summary,
        recommendedActions: aiResult.recommendedActions,
        provider: aiResult.provider,
        isFallback: aiResult.isFallback,
        classifiedAt: new Date(),
      } : null,
      timeline: [{
        event: "incident_created",
        message: "Emergency report received",
        performedBy: reportedBy,
        timestamp: new Date(),
      }],
      createdBy: reportedBy,
    });

    // Link source report to incident
    await SourceReport.findByIdAndUpdate(sourceReport._id, { incidentId: incident._id });

    // If AI classified, add timeline event and update status
    if (aiResult) {
      incident.status = "CLASSIFIED";
      incident.timeline.push({
        event: "classified",
        message: `Incident classified as ${aiResult.severity} ${aiResult.type} by ${aiResult.isFallback ? "rule engine" : "AI"}`,
        timestamp: new Date(),
        metadata: { provider: aiResult.provider, confidence: aiResult.confidence },
      });
      await incident.save();
    }

    // Duplicate detection
    const duplicates = await findDuplicateCandidates(incident);
    if (duplicates.length > 0) {
      incident.duplicateCandidates = duplicates.map((d) => ({
        incidentId: d.incidentId,
        score: d.score,
        locationScore: d.locationScore,
        timeScore: d.timeScore,
        textScore: d.textScore,
        status: "pending",
        detectedAt: new Date(),
      }));
      incident.status = "DUPLICATE_CANDIDATE";
      incident.timeline.push({
        event: "duplicate_detected",
        message: `${duplicates.length} possible duplicate(s) detected`,
        timestamp: new Date(),
        metadata: { count: duplicates.length, topScore: duplicates[0].score },
      });
      await incident.save();

      // Create duplicate alert
      await createAlert({
        type: "duplicate_candidate",
        severity: "warning",
        title: "Possible Duplicate Incident",
        message: `Incident ${incident.publicId} may be a duplicate of ${duplicates[0].publicId || "an existing incident"} (score: ${Math.round(duplicates[0].score * 100)}%)`,
        incidentId: incident._id,
      });
    }

    // Analytics events
    await AnalyticsEvent.create({
      eventType: "incident_created",
      incidentId: incident._id,
      userId: reportedBy,
      metadata: { type: incident.type, severity: incident.severity },
    });
    if (aiResult) {
      await AnalyticsEvent.create({
        eventType: aiResult.isFallback ? "ai_classification_fallback" : "ai_classification_success",
        incidentId: incident._id,
        metadata: { provider: aiResult.provider, confidence: aiResult.confidence },
      });
    }

    const populatedIncident = await Incident.findById(incident._id)
      .populate("sourceReports")
      .populate("createdBy", "name email role");

    emit("incident:created", {
      publicId: incident.publicId,
      type: incident.type,
      severity: incident.severity,
      priority: incident.priority,
      status: incident.status,
      title: incident.title,
      address: incident.address,
      location: incident.location,
      createdAt: incident.createdAt,
    });

    if (aiResult) {
      emit("incident:classified", {
        publicId: incident.publicId,
        aiClassification: incident.aiClassification,
      });
    }

    res.status(201).json({
      success: true,
      data: { incident: populatedIncident },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/incidents
const getIncidents = async (req, res, next) => {
  try {
    const { status, type, severity, priority, search, page = 1, limit = 50 } = req.query;
    const filter = {};

    if (status) filter.status = status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (priority) filter.priority = priority;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { address: { $regex: search, $options: "i" } },
        { publicId: { $regex: search, $options: "i" } },
      ];
    }

    // Responders only see assigned incidents
    if (req.user && req.user.role === "responder") {
      filter.assignedResponder = req.user._id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .populate("createdBy", "name role")
        .populate("assignedResponder", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Incident.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: incidents,
      meta: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/incidents/:id
const getIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({
      $or: [{ publicId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
    })
      .populate("sourceReports")
      .populate("createdBy", "name email role")
      .populate("assignedResponder", "name email role")
      .populate("assignedResources.resourceId")
      .populate("duplicateCandidates.incidentId", "publicId type severity status title");

    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/incidents/:id
const updateIncident = async (req, res, next) => {
  try {
    const { type, severity, priority, description, address, title } = req.body;

    const incident = await Incident.findOne({ publicId: req.params.id });
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const changes = [];
    if (type && type !== incident.type) { changes.push(`type: ${incident.type}→${type}`); incident.type = type; }
    if (severity && severity !== incident.severity) { changes.push(`severity: ${incident.severity}→${severity}`); incident.severity = severity; }
    if (priority && priority !== incident.priority) { changes.push(`priority: ${incident.priority}→${priority}`); incident.priority = priority; }
    if (description) incident.description = description;
    if (address) incident.address = address;
    if (title) incident.title = title;

    if (changes.length > 0) {
      incident.timeline.push({
        event: "operator_override",
        message: `Operator modified: ${changes.join(", ")}`,
        performedBy: req.user._id,
        timestamp: new Date(),
        metadata: { changes },
      });

      await AnalyticsEvent.create({
        eventType: "operator_ai_override",
        incidentId: incident._id,
        userId: req.user._id,
        metadata: { changes },
      });
    }

    await incident.save();

    emit("incident:updated", {
      publicId: incident.publicId,
      type: incident.type,
      severity: incident.severity,
      priority: incident.priority,
      updatedAt: incident.updatedAt,
    });

    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/classify
const classifyIncident = async (req, res, next) => {
  try {
    const incident = await Incident.findOne({ publicId: req.params.id });
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const aiResult = await classify(incident.description);

    incident.type = aiResult.type;
    incident.severity = aiResult.severity;
    incident.priority = aiResult.priority;
    incident.aiClassification = {
      type: aiResult.type,
      severity: aiResult.severity,
      priority: aiResult.priority,
      confidence: aiResult.confidence,
      summary: aiResult.summary,
      recommendedActions: aiResult.recommendedActions,
      provider: aiResult.provider,
      isFallback: aiResult.isFallback,
      classifiedAt: new Date(),
    };
    if (incident.status === "REPORTED") incident.status = "CLASSIFIED";
    incident.timeline.push({
      event: "classified",
      message: `Re-classified as ${aiResult.severity} ${aiResult.type} by ${aiResult.isFallback ? "rule engine" : "AI"}`,
      performedBy: req.user._id,
      timestamp: new Date(),
    });

    await incident.save();

    await AnalyticsEvent.create({
      eventType: aiResult.isFallback ? "ai_classification_fallback" : "ai_classification_success",
      incidentId: incident._id,
      userId: req.user._id,
      metadata: { provider: aiResult.provider, confidence: aiResult.confidence },
    });

    emit("incident:classified", {
      publicId: incident.publicId,
      aiClassification: incident.aiClassification,
      type: incident.type,
      severity: incident.severity,
      priority: incident.priority,
    });

    res.json({ success: true, data: aiResult });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/merge
const mergeIncident = async (req, res, next) => {
  try {
    const { sourceIncidentId } = req.body;
    if (!sourceIncidentId) {
      return res.status(400).json({ success: false, message: "sourceIncidentId is required", code: "VALIDATION_ERROR" });
    }

    const primary = await Incident.findOne({ publicId: req.params.id });
    const secondary = await Incident.findOne({ publicId: sourceIncidentId });

    if (!primary || !secondary) {
      return res.status(404).json({ success: false, message: "One or both incidents not found", code: "INCIDENT_NOT_FOUND" });
    }

    // Move source reports from secondary to primary
    primary.sourceReports.push(...secondary.sourceReports);
    // Mark secondary as merged
    secondary.status = "MERGED";
    secondary.timeline.push({
      event: "merged",
      message: `Merged into ${primary.publicId} by operator`,
      performedBy: req.user._id,
      timestamp: new Date(),
    });
    await secondary.save();

    // Update primary
    primary.timeline.push({
      event: "duplicate_confirmed",
      message: `Report ${secondary.publicId} merged into this incident by operator`,
      performedBy: req.user._id,
      timestamp: new Date(),
    });

    // Update duplicate candidate status
    const candidate = primary.duplicateCandidates.find(
      (d) => d.incidentId && d.incidentId.toString() === secondary._id.toString()
    );
    if (candidate) candidate.status = "confirmed";

    if (primary.status === "DUPLICATE_CANDIDATE") primary.status = "CLASSIFIED";
    await primary.save();

    await AnalyticsEvent.create({
      eventType: "incident_merged",
      incidentId: primary._id,
      userId: req.user._id,
      metadata: { mergedIncidentId: secondary.publicId },
    });

    emit("incident:updated", { publicId: primary.publicId, status: primary.status, updatedAt: primary.updatedAt });
    emit("incident:updated", { publicId: secondary.publicId, status: "MERGED", updatedAt: secondary.updatedAt });

    res.json({ success: true, data: { primaryId: primary.publicId, mergedId: secondary.publicId, status: primary.status } });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/assign
const assignIncident = async (req, res, next) => {
  try {
    const { resourceIds, responderId } = req.body;
    if (!resourceIds || !Array.isArray(resourceIds) || resourceIds.length === 0) {
      return res.status(400).json({ success: false, message: "resourceIds array is required", code: "VALIDATION_ERROR" });
    }

    const incident = await Incident.findOne({ publicId: req.params.id });
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }
    if (["RESOLVED", "CLOSED", "MERGED"].includes(incident.status)) {
      return res.status(400).json({ success: false, message: "Cannot assign resources to a resolved/closed incident", code: "INVALID_STATUS_TRANSITION" });
    }

    const assignedIds = [];
    for (const rid of resourceIds) {
      const resource = await Resource.findOne({
        $or: [{ publicId: rid }, { _id: rid.match(/^[0-9a-fA-F]{24}$/) ? rid : null }],
      });
      if (!resource) continue;
      if (resource.status === "unavailable" || resource.status === "maintenance") continue;

      resource.status = "assigned";
      resource.currentIncident = incident._id;
      resource.availability.isAvailable = false;
      resource.availability.lastUpdated = new Date();
      await resource.save();

      incident.assignedResources.push({
        resourceId: resource._id,
        assignedAt: new Date(),
        assignedBy: req.user._id,
        status: "assigned",
      });
      assignedIds.push(resource.publicId);

      emit("resource:updated", { resourceId: resource.publicId, status: "assigned", incidentId: incident.publicId });

      await AnalyticsEvent.create({
        eventType: "resource_assigned",
        incidentId: incident._id,
        resourceId: resource._id,
        userId: req.user._id,
        metadata: { resourceType: resource.type },
      });
    }

    if (assignedIds.length === 0) {
      return res.status(400).json({ success: false, message: "No valid available resources found", code: "RESOURCE_UNAVAILABLE" });
    }

    // Assign responder if provided
    if (responderId) {
      incident.assignedResponder = responderId;
    }

    incident.status = "ASSIGNED";
    incident.timeline.push({
      event: "resource_assigned",
      message: `Resources assigned: ${assignedIds.join(", ")}`,
      performedBy: req.user._id,
      timestamp: new Date(),
      metadata: { newStatus: "ASSIGNED", resources: assignedIds },
    });
    await incident.save();

    emit("incident:assigned", { incidentId: incident.publicId, resourceIds: assignedIds, status: "ASSIGNED" });

    res.json({ success: true, data: { incidentId: incident.publicId, assignedResources: assignedIds, status: "ASSIGNED" } });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/escalate
const escalateIncident = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const incident = await Incident.findOne({ publicId: req.params.id });
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const level = "critical";
    incident.escalation.isEscalated = true;
    incident.escalation.level = level;
    incident.escalation.reason = reason || "Manual escalation by operator";
    incident.escalation.escalatedAt = new Date();
    incident.escalation.escalatedBy = req.user._id;

    incident.timeline.push({
      event: "escalated",
      message: `Incident manually escalated: ${reason || "No reason provided"}`,
      performedBy: req.user._id,
      timestamp: new Date(),
    });
    await incident.save();

    const alert = await createAlert({
      type: "escalation_critical",
      severity: "critical",
      title: `ESCALATED — ${incident.priority} Incident`,
      message: `Incident ${incident.publicId} has been escalated: ${reason || "Manual escalation"}`,
      incidentId: incident._id,
    });

    emit("alert:created", {
      id: alert._id,
      publicId: alert.publicId,
      type: "escalation_critical",
      severity: "critical",
      message: alert.message,
      incidentId: incident.publicId,
    });
    emit("incident:updated", { publicId: incident.publicId, escalation: incident.escalation, updatedAt: incident.updatedAt });

    res.json({ success: true, data: { incidentId: incident.publicId, escalationLevel: level, alertCreated: true } });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/resolve
const resolveIncident = async (req, res, next) => {
  try {
    const { note } = req.body;
    const incident = await Incident.findOne({ publicId: req.params.id })
      .populate("assignedResources.resourceId");
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const validFromStatuses = ["ASSIGNED", "EN_ROUTE", "ON_SCENE", "CLASSIFIED", "REPORTED"];
    if (!validFromStatuses.includes(incident.status)) {
      return res.status(400).json({ success: false, message: `Cannot resolve incident with status ${incident.status}`, code: "INVALID_STATUS_TRANSITION" });
    }

    const prevStatus = incident.status;
    incident.status = "RESOLVED";
    incident.resolution.resolvedAt = new Date();
    incident.resolution.resolvedBy = req.user._id;
    incident.resolution.resolutionNote = note || null;

    incident.timeline.push({
      event: "resolved",
      message: note || "Incident resolved",
      performedBy: req.user._id,
      timestamp: new Date(),
      metadata: { previousStatus: prevStatus, newStatus: "RESOLVED" },
    });

    // Release assigned resources
    for (const ar of incident.assignedResources) {
      if (ar.resourceId && typeof ar.resourceId === "object") {
        ar.status = "completed";
        await Resource.findByIdAndUpdate(ar.resourceId._id, {
          status: "available",
          currentIncident: null,
          "availability.isAvailable": true,
          "availability.lastUpdated": new Date(),
        });
        emit("resource:updated", { resourceId: ar.resourceId.publicId, status: "available", incidentId: null });
      }
    }

    await incident.save();

    await AnalyticsEvent.create({
      eventType: "incident_resolved",
      incidentId: incident._id,
      userId: req.user._id,
      metadata: { type: incident.type, severity: incident.severity, priority: incident.priority },
    });

    emit("incident:resolved", { incidentId: incident.publicId, status: "RESOLVED", resolvedAt: incident.resolution.resolvedAt });

    res.json({ success: true, data: { publicId: incident.publicId, status: "RESOLVED", resolvedAt: incident.resolution.resolvedAt } });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/incidents/:id/status  (responder status updates)
const updateStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;
    const incident = await Incident.findOne({ publicId: req.params.id })
      .populate("assignedResources.resourceId");
    if (!incident) {
      return res.status(404).json({ success: false, message: "Incident not found", code: "INCIDENT_NOT_FOUND" });
    }

    const allowed = VALID_TRANSITIONS[incident.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition: ${incident.status} → ${status}`,
        code: "INVALID_STATUS_TRANSITION",
      });
    }

    const prevStatus = incident.status;
    incident.status = status;
    incident.timeline.push({
      event: "status_changed",
      message: note || `Status changed to ${status}`,
      performedBy: req.user._id,
      timestamp: new Date(),
      metadata: { previousStatus: prevStatus, newStatus: status },
    });

    // Update associated resources
    const resourceStatusMap = { EN_ROUTE: "en_route", ON_SCENE: "on_scene" };
    if (resourceStatusMap[status]) {
      for (const ar of incident.assignedResources) {
        if (ar.resourceId && ar.status !== "completed" && ar.status !== "cancelled") {
          ar.status = resourceStatusMap[status] === "en_route" ? "en_route" : "on_scene";
          if (ar.resourceId._id) {
            await Resource.findByIdAndUpdate(ar.resourceId._id, { status: resourceStatusMap[status] });
            emit("resource:updated", {
              resourceId: ar.resourceId.publicId || ar.resourceId,
              status: resourceStatusMap[status],
            });
          }
        }
      }
    }

    await incident.save();

    emit("incident:updated", {
      publicId: incident.publicId,
      status: incident.status,
      updatedAt: incident.updatedAt,
    });

    res.json({ success: true, data: { publicId: incident.publicId, status, updatedAt: incident.updatedAt } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createIncident,
  getIncidents,
  getIncident,
  updateIncident,
  classifyIncident,
  mergeIncident,
  assignIncident,
  escalateIncident,
  resolveIncident,
  updateStatus,
  setIO,
};
