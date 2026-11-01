const mongoose = require("mongoose");
const Incident = require("../models/Incident");
const SourceReport = require("../models/SourceReport");
const Resource = require("../models/Resource");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { classify, generateSummary } = require("../services/ai.service");
const { ingestReport } = require("../services/incident.service");
const notifications = require("../services/notification.service");
const { createAlert } = require("../services/alert.service");
const dispatch = require("../services/dispatch.service");
const credibilityService = require("../services/credibility.service");

let io = null;
function setIO(socketIO) { io = socketIO; }
function emit(event, data) { if (io) io.emit(event, data); }

const VALID_TYPES = ["fire", "flood", "medical", "accident", "industrial", "structural", "other"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_PRIORITIES = ["P1", "P2", "P3", "P4"];
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const TERMINAL_STATUSES = ["RESOLVED", "CLOSED", "MERGED"];
const COMMAND_ROLES = ["operator", "admin"]; // full control of incidents
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

// Valid status transitions (RESOLVED goes through the resolve flow so resources are released)
const VALID_TRANSITIONS = {
  REPORTED: ["CLASSIFIED", "DUPLICATE_CANDIDATE"],
  CLASSIFIED: ["ASSIGNED", "DUPLICATE_CANDIDATE"],
  ASSIGNED: ["EN_ROUTE", "ON_SCENE", "RESOLVED"],
  EN_ROUTE: ["ON_SCENE", "RESOLVED"],
  ON_SCENE: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  DUPLICATE_CANDIDATE: ["CLASSIFIED"],
  MERGED: [],
  CLOSED: [],
};

const fail = (res, status, message, code) => res.status(status).json({ success: false, message, code });

// ── helpers ───────────────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function findByPublicId(id) {
  return Incident.findOne({ publicId: String(id) });
}

const isCommand = (user) => !!user && COMMAND_ROLES.includes(user.role);

/** IDs of the resources operated by this responder user. */
async function responderResourceIds(user) {
  const owned = await Resource.find({ responderUser: user._id }).select("_id").lean();
  return owned.map((r) => r._id);
}

/** A responder may act on an incident if it is assigned to them directly or via one of their units. */
async function isAssignedResponder(user, incident) {
  if (!user || user.role !== "responder") return false;
  if (incident.assignedResponder && String(incident.assignedResponder._id || incident.assignedResponder) === String(user._id)) return true;
  const owned = await responderResourceIds(user);
  const ownedSet = new Set(owned.map(String));
  return (incident.assignedResources || []).some((ar) => {
    const rid = ar.resourceId && (ar.resourceId._id || ar.resourceId);
    return rid && ownedSet.has(String(rid));
  });
}

/** What anonymous visitors / citizens may see when tracking an incident by its ID. */
const PUBLIC_TIMELINE = {
  incident_created: () => "Emergency report received",
  classified: () => "Report assessed and prioritised",
  resource_assigned: () => "Response units assigned",
  response_delayed: null,
  status_changed: (evt) => `Status updated to ${String((evt.metadata && evt.metadata.newStatus) || "").replace(/_/g, " ").toLowerCase() || "in progress"}`,
  resolved: () => "Incident resolved",
};

function publicView(incident) {
  const obj = incident.toObject ? incident.toObject() : incident;
  const ai = obj.aiClassification;
  return {
    publicId: obj.publicId,
    type: obj.type,
    severity: obj.severity,
    priority: obj.priority,
    status: obj.status,
    title: obj.title,
    address: obj.address,
    location: obj.location,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    aiClassification: ai ? { summary: ai.summary, confidence: ai.confidence, isFallback: ai.isFallback } : null,
    timeline: (obj.timeline || [])
      .filter((e) => typeof PUBLIC_TIMELINE[e.event] === "function")
      .map((e) => ({ event: e.event, message: PUBLIC_TIMELINE[e.event](e), timestamp: e.timestamp })),
  };
}

function incidentBroadcast(incident, extra = {}) {
  return {
    publicId: incident.publicId,
    type: incident.type,
    severity: incident.severity,
    priority: incident.priority,
    status: incident.status,
    title: incident.title,
    address: incident.address,
    location: incident.location,
    updatedAt: incident.updatedAt,
    ...extra,
  };
}

async function broadcastAlert(alert, incident) {
  emit("alert:created", {
    id: alert._id,
    publicId: alert.publicId,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    incidentId: incident.publicId,
    acknowledged: false,
  });
}

/** Frees every unit still attached to the incident. Only touches units that are still on THIS incident. */
async function releaseResources(incident) {
  const released = [];
  for (const ar of incident.assignedResources) {
    if (["completed", "cancelled"].includes(ar.status)) continue;
    const rid = ar.resourceId && (ar.resourceId._id || ar.resourceId);
    ar.status = "completed";
    if (!rid) continue;
    const resource = await Resource.findOneAndUpdate(
      { _id: rid, currentIncident: incident._id },
      { status: "available", currentIncident: null, "availability.isAvailable": true, "availability.lastUpdated": new Date() },
      { new: true }
    );
    if (resource) {
      released.push(resource.publicId);
      emit("resource:updated", { resourceId: resource.publicId, status: "available", incidentId: null });
    }
  }
  return released;
}

// ── POST /api/v1/incidents ────────────────────────────────────────────────────
const createIncident = async (req, res, next) => {
  try {
    const { type, address, imageUrl } = req.body;
    const description = typeof req.body.description === "string" ? req.body.description.trim() : "";
    const location = req.body.location;

    if (!description) return fail(res, 400, "Description is required", "VALIDATION_ERROR");
    if (description.length > 2000) return fail(res, 400, "Description must be 2000 characters or fewer", "VALIDATION_ERROR");

    const coords = location && Array.isArray(location.coordinates) ? location.coordinates : null;
    const [lon, lat] = coords || [];
    if (!coords || coords.length !== 2 || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
      return fail(res, 400, "Valid location with coordinates [longitude, latitude] is required", "VALIDATION_ERROR");
    }

    const { incident } = await ingestReport({
      description,
      coordinates: [lon, lat],
      typeHint: type,
      address: typeof address === "string" ? address.trim() : "",
      imageUrl: typeof imageUrl === "string" && /^\/uploads\/[\w.-]+$/.test(imageUrl) ? imageUrl : null,
      user: req.user || null,
      sourceType: "web",
    });

    // Staff get the full record; anonymous/citizen reporters get only the public tracking view
    if (req.user && ["operator", "admin", "responder", "hospital"].includes(req.user.role)) {
      const full = await Incident.findById(incident._id).populate("sourceReports").populate("createdBy", "name email role");
      return res.status(201).json({ success: true, data: { incident: full } });
    }
    return res.status(201).json({ success: true, data: { incident: publicView(incident), trackingId: incident.publicId } });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/incidents ─────────────────────────────────────────────────────
const getIncidents = async (req, res, next) => {
  try {
    const { status, type, severity, priority, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = {};

    if (status) filter.status = status.includes(",") ? { $in: status.split(",") } : status;
    if (type) filter.type = type;
    if (severity) filter.severity = severity;
    if (priority) filter.priority = priority;
    if (search) {
      const rx = { $regex: escapeRegex(search), $options: "i" };
      filter.$or = [{ title: rx }, { description: rx }, { address: rx }, { publicId: rx }];
    }

    // Responders only see incidents assigned to them (directly or through their units)
    if (req.user && req.user.role === "responder") {
      const owned = await responderResourceIds(req.user);
      const scope = [{ assignedResponder: req.user._id }];
      if (owned.length) scope.push({ "assignedResources.resourceId": { $in: owned } });
      filter.$and = [{ $or: scope }];
    }

    const skip = (page - 1) * limit;
    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .populate("createdBy", "name role")
        .populate("assignedResponder", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Incident.countDocuments(filter),
    ]);

    res.json({ success: true, data: incidents, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/incidents/:id ─────────────────────────────────────────────────
const getIncident = async (req, res, next) => {
  try {
    const id = req.params.id;
    const query = OBJECT_ID.test(id) ? { $or: [{ publicId: id }, { _id: id }] } : { publicId: id };
    const incident = await Incident.findOne(query)
      .populate("sourceReports")
      .populate("createdBy", "name email role")
      .populate("assignedResponder", "name email role")
      .populate("assignedResources.resourceId")
      .populate("duplicateCandidates.incidentId", "publicId type severity status title");

    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");

    const user = req.user;
    const fullAccess = isCommand(user) || (user && user.role === "responder" && (await isAssignedResponder(user, incident)));
    res.json({ success: true, data: fullAccess ? incident : publicView(incident) });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/incidents/:id ───────────────────────────────────────────────
const updateIncident = async (req, res, next) => {
  try {
    const { type, severity, priority, description, address, title, summary } = req.body;

    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, `Cannot edit a ${incident.status.toLowerCase()} incident`, "INVALID_STATUS_TRANSITION");

    if (type !== undefined && !VALID_TYPES.includes(type)) return fail(res, 400, "Invalid incident type", "VALIDATION_ERROR");
    if (severity !== undefined && !VALID_SEVERITIES.includes(severity)) return fail(res, 400, "Invalid severity", "VALIDATION_ERROR");
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) return fail(res, 400, "Invalid priority", "VALIDATION_ERROR");

    const changes = [];
    if (type && type !== incident.type) { changes.push(`type: ${incident.type}→${type}`); incident.type = type; }
    if (severity && severity !== incident.severity) { changes.push(`severity: ${incident.severity}→${severity}`); incident.severity = severity; }
    if (priority && priority !== incident.priority) { changes.push(`priority: ${incident.priority}→${priority}`); incident.priority = priority; }
    if (typeof description === "string" && description.trim()) incident.description = description.trim().slice(0, 2000);
    if (typeof address === "string") incident.address = address.trim().slice(0, 200);
    if (typeof title === "string" && title.trim()) incident.title = title.trim().slice(0, 200);

    // Operators can edit the AI summary before sharing it (PRD FR-7.6)
    if (typeof summary === "string" && summary.trim()) {
      if (!incident.aiClassification) incident.aiClassification = { type: incident.type, severity: incident.severity, priority: incident.priority, provider: "manual", isFallback: false };
      incident.aiClassification.summary = summary.trim().slice(0, 1500);
      incident.aiClassification.provider = "manual";
      changes.push("summary edited");
    }

    if (changes.length > 0) {
      incident.timeline.push({
        event: "operator_override",
        message: `Operator modified: ${changes.join(", ")}`,
        performedBy: req.user._id,
        timestamp: new Date(),
        metadata: { changes },
      });
      await AnalyticsEvent.create({ eventType: "operator_ai_override", incidentId: incident._id, userId: req.user._id, metadata: { changes } });
    }

    await incident.save();
    emit("incident:updated", incidentBroadcast(incident));
    res.json({ success: true, data: incident });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/classify ───────────────────────────────────────
const classifyIncident = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Cannot re-classify a closed incident", "INVALID_STATUS_TRANSITION");

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

    emit("incident:classified", { publicId: incident.publicId, aiClassification: incident.aiClassification, type: incident.type, severity: incident.severity, priority: incident.priority });
    emit("incident:updated", incidentBroadcast(incident));

    res.json({ success: true, data: aiResult });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/summary ────────────────────────────────────────
// Regenerates the incident summary from ALL merged reports + assigned units (SITREP-style).
const regenerateSummary = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");

    const [reports, resources] = await Promise.all([
      SourceReport.find({ _id: { $in: incident.sourceReports } }).sort({ createdAt: 1 }).lean(),
      Resource.find({ _id: { $in: incident.assignedResources.map((a) => a.resourceId) } }).select("publicId name").lean(),
    ]);
    const result = await generateSummary(incident, reports, resources);

    if (!incident.aiClassification) {
      incident.aiClassification = { type: incident.type, severity: incident.severity, priority: incident.priority, provider: result.provider, isFallback: result.isFallback };
    }
    incident.aiClassification.summary = result.summary;
    incident.aiClassification.provider = result.provider;
    incident.aiClassification.isFallback = result.isFallback;
    incident.timeline.push({ event: "summary_updated", message: `Summary regenerated (${result.isFallback ? "template" : "AI"})`, performedBy: req.user._id, timestamp: new Date() });
    await incident.save();

    emit("incident:classified", { publicId: incident.publicId, aiClassification: incident.aiClassification });
    res.json({ success: true, data: { summary: result.summary, provider: result.provider, isFallback: result.isFallback } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/merge ──────────────────────────────────────────
// Merges the two incidents; the SURVIVOR is the one that already has units assigned, otherwise the older one.
// (Previously the incident in the URL always survived, so merging a fresh duplicate "into" an older
//  dispatched incident the wrong way round orphaned the dispatched units.)
const mergeIncident = async (req, res, next) => {
  try {
    const { sourceIncidentId } = req.body;
    if (!sourceIncidentId) return fail(res, 400, "sourceIncidentId is required", "VALIDATION_ERROR");
    if (sourceIncidentId === req.params.id) return fail(res, 400, "Cannot merge an incident into itself", "VALIDATION_ERROR");

    const [a, b] = await Promise.all([findByPublicId(req.params.id), findByPublicId(sourceIncidentId)]);
    if (!a || !b) return fail(res, 404, "One or both incidents not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(a.status) || TERMINAL_STATUSES.includes(b.status)) {
      return fail(res, 400, "Resolved, closed or already merged incidents cannot be merged", "INVALID_STATUS_TRANSITION");
    }

    const aHas = a.assignedResources.length > 0;
    const bHas = b.assignedResources.length > 0;
    let survivor;
    let loser;
    if (aHas !== bHas) [survivor, loser] = aHas ? [a, b] : [b, a];
    else [survivor, loser] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

    const now = new Date();
    const loserPrevStatus = loser.status;

    // Reports → survivor (keep every original report as evidence)
    for (const rid of loser.sourceReports) {
      if (!survivor.sourceReports.some((x) => String(x) === String(rid))) survivor.sourceReports.push(rid);
    }
    await SourceReport.updateMany({ _id: { $in: loser.sourceReports } }, { incidentId: survivor._id });

    // Units dispatched to the loser follow the survivor (entries are copied, not removed, so unmerge can restore them)
    for (const ar of loser.assignedResources) {
      if (["completed", "cancelled"].includes(ar.status)) continue;
      survivor.assignedResources.push({ resourceId: ar.resourceId, assignedAt: ar.assignedAt, assignedBy: ar.assignedBy, status: ar.status });
      await Resource.updateOne({ _id: ar.resourceId, currentIncident: loser._id }, { currentIncident: survivor._id });
    }

    // Keep the more urgent assessment
    if (SEVERITY_RANK[loser.severity] > SEVERITY_RANK[survivor.severity]) {
      survivor.severity = loser.severity;
      survivor.priority = loser.priority;
    }

    try {
      const srcs = await SourceReport.find({ _id: { $in: survivor.sourceReports } }).select("sourceType").lean();
      const base = survivor.credibility && survivor.credibility.level
        ? survivor.credibility
        : loser.credibility && loser.credibility.level ? loser.credibility : null;
      if (base) survivor.credibility = credibilityService.corroborate(base, srcs.map((x) => x.sourceType || "web"));
    } catch (e) { console.error("Corroboration failed:", e.message); }

    loser.status = "MERGED";
    loser.mergedInto = survivor._id;
    loser.timeline.push({
      event: "merged",
      message: `Merged into ${survivor.publicId} by operator`,
      performedBy: req.user._id,
      timestamp: now,
      metadata: { previousStatus: loserPrevStatus, mergedInto: survivor.publicId },
    });

    survivor.timeline.push({
      event: "duplicate_confirmed",
      message: `Report ${loser.publicId} merged into this incident by operator`,
      performedBy: req.user._id,
      timestamp: now,
      metadata: { mergedIncident: loser.publicId },
    });

    for (const [inc, other] of [[survivor, loser], [loser, survivor]]) {
      for (const c of inc.duplicateCandidates) {
        if (c.incidentId && String(c.incidentId) === String(other._id)) c.status = "confirmed";
      }
    }
    if (survivor.status === "DUPLICATE_CANDIDATE" && !survivor.duplicateCandidates.some((c) => c.status === "pending")) {
      survivor.status = survivor.assignedResources.length ? "ASSIGNED" : "CLASSIFIED";
    }

    await loser.save();
    await survivor.save();

    await AnalyticsEvent.create({ eventType: "incident_merged", incidentId: survivor._id, userId: req.user._id, metadata: { mergedIncidentId: loser.publicId } });
    await AnalyticsEvent.create({ eventType: "duplicate_confirmed", incidentId: survivor._id, userId: req.user._id, metadata: { mergedIncidentId: loser.publicId } });

    emit("incident:updated", incidentBroadcast(survivor));
    emit("incident:updated", incidentBroadcast(loser, { mergedInto: survivor.publicId }));

    res.json({ success: true, data: { primaryId: survivor.publicId, mergedId: loser.publicId, status: survivor.status } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/unmerge ────────────────────────────────────────
// Operator undoes a wrong merge (PRD FR-3.4 "split merged incidents").
const unmergeIncident = async (req, res, next) => {
  try {
    const loser = await findByPublicId(req.params.id);
    if (!loser) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (loser.status !== "MERGED" || !loser.mergedInto) return fail(res, 400, "Incident is not merged", "INVALID_STATUS_TRANSITION");

    const survivor = await Incident.findById(loser.mergedInto);
    if (!survivor) return fail(res, 404, "Surviving incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(survivor.status)) return fail(res, 400, "The surviving incident is already closed", "INVALID_STATUS_TRANSITION");

    const loserReportIds = loser.sourceReports.map(String);
    survivor.sourceReports = survivor.sourceReports.filter((r) => !loserReportIds.includes(String(r)));
    await SourceReport.updateMany({ _id: { $in: loser.sourceReports } }, { incidentId: loser._id });

    // Units that came from the loser go back to it
    const loserResourceIds = loser.assignedResources.filter((a) => !["completed", "cancelled"].includes(a.status)).map((a) => String(a.resourceId));
    survivor.assignedResources = survivor.assignedResources.filter((ar) => !loserResourceIds.includes(String(ar.resourceId)));
    await Resource.updateMany({ _id: { $in: loserResourceIds }, currentIncident: survivor._id }, { currentIncident: loser._id });

    const merged = loser.timeline.slice().reverse().find((e) => e.event === "merged");
    const prev = merged && merged.metadata && merged.metadata.previousStatus;
    loser.status = prev && !["MERGED", "DUPLICATE_CANDIDATE"].includes(prev) ? prev : (loser.assignedResources.length ? "ASSIGNED" : "CLASSIFIED");
    loser.mergedInto = null;
    for (const c of loser.duplicateCandidates) if (c.incidentId && String(c.incidentId) === String(survivor._id)) c.status = "rejected";
    for (const c of survivor.duplicateCandidates) if (c.incidentId && String(c.incidentId) === String(loser._id)) c.status = "rejected";

    loser.timeline.push({ event: "unmerged", message: `Split from ${survivor.publicId} by operator`, performedBy: req.user._id, timestamp: new Date() });
    survivor.timeline.push({ event: "unmerged", message: `Report ${loser.publicId} split out by operator`, performedBy: req.user._id, timestamp: new Date() });
    await loser.save();
    await survivor.save();

    emit("incident:updated", incidentBroadcast(survivor));
    emit("incident:updated", incidentBroadcast(loser));
    res.json({ success: true, data: { restoredId: loser.publicId, primaryId: survivor.publicId, status: loser.status } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/reject-duplicate ───────────────────────────────
const rejectDuplicate = async (req, res, next) => {
  try {
    const { candidateId } = req.body;
    if (!candidateId) return fail(res, 400, "candidateId is required", "VALIDATION_ERROR");

    const incident = await findByPublicId(req.params.id);
    const other = await findByPublicId(candidateId);
    if (!incident || !other) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");

    const entry = incident.duplicateCandidates.find((c) => c.incidentId && String(c.incidentId) === String(other._id));
    if (!entry) return fail(res, 404, "That incident is not a duplicate candidate", "NOT_FOUND");
    entry.status = "rejected";

    incident.timeline.push({ event: "duplicate_rejected", message: `Operator marked ${other.publicId} as NOT a duplicate`, performedBy: req.user._id, timestamp: new Date() });
    if (incident.status === "DUPLICATE_CANDIDATE" && !incident.duplicateCandidates.some((c) => c.status === "pending")) {
      incident.status = incident.assignedResources.length ? "ASSIGNED" : "CLASSIFIED";
    }
    await incident.save();

    await AnalyticsEvent.create({ eventType: "duplicate_rejected", incidentId: incident._id, userId: req.user._id, metadata: { candidate: other.publicId } });
    emit("incident:updated", incidentBroadcast(incident));
    res.json({ success: true, data: { publicId: incident.publicId, status: incident.status, candidateId: other.publicId } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/assign ─────────────────────────────────────────
const assignIncident = async (req, res, next) => {
  try {
    const { resourceIds, responderId } = req.body;
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) return fail(res, 400, "resourceIds array is required", "VALIDATION_ERROR");
    if (resourceIds.length > 20) return fail(res, 400, "Too many resources in one dispatch", "VALIDATION_ERROR");

    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) {
      return fail(res, 400, "Cannot assign resources to a resolved/closed/merged incident", "INVALID_STATUS_TRANSITION");
    }

    const { assignedIds, skipped } = await dispatch.dispatchUnits(incident, resourceIds, { user: req.user, responderId });
    if (assignedIds.length === 0) {
      return fail(res, 409, "None of the selected resources is available", "RESOURCE_UNAVAILABLE");
    }

    res.json({ success: true, data: { incidentId: incident.publicId, assignedResources: assignedIds, skipped, status: incident.status } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/auto-dispatch  (one click: send the whole recommended package) ──
const autoDispatchIncident = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Incident is already closed", "INVALID_STATUS_TRANSITION");
    const ids = await dispatch.recommendedIds(incident);
    if (ids.length === 0) return fail(res, 409, "No suitable units are available", "RESOURCE_UNAVAILABLE");
    const { assignedIds, skipped } = await dispatch.dispatchUnits(incident, ids, { user: req.user, auto: true });
    if (assignedIds.length === 0) return fail(res, 409, "None of the recommended units is available", "RESOURCE_UNAVAILABLE");
    await AnalyticsEvent.create({ eventType: "auto_dispatch", incidentId: incident._id, userId: req.user._id, metadata: { resources: assignedIds } });
    res.json({ success: true, data: { incidentId: incident.publicId, assignedResources: assignedIds, skipped, status: incident.status } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/recall  (operator override of a dispatch) ──
const recallIncident = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Incident is already closed", "INVALID_STATUS_TRANSITION");
    if (incident.status === "ON_SCENE") return fail(res, 400, "Units are already on scene – resolve the incident instead", "INVALID_STATUS_TRANSITION");
    const released = await dispatch.recallUnits(incident, req.user);
    if (released.length === 0) return fail(res, 409, "There is no active dispatch to recall", "NOTHING_TO_RECALL");
    res.json({ success: true, data: { incidentId: incident.publicId, released, status: incident.status } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/dismiss  (operator marks a report as false / prank) ──
const dismissIncident = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Incident is already closed", "INVALID_STATUS_TRANSITION");
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    await dispatch.recallUnits(incident, req.user);
    incident.status = "CLOSED";
    incident.resolution = { resolvedAt: new Date(), resolvedBy: req.user._id, resolutionNote: `False report${reason ? `: ${reason}` : ""}` };
    incident.timeline.push({
      event: "dismissed", message: `Dismissed as a false report by operator${reason ? ` (${reason})` : ""}`,
      performedBy: req.user._id, timestamp: new Date(), metadata: { newStatus: "CLOSED" },
    });
    await incident.save();
    await AnalyticsEvent.create({ eventType: "false_report_dismissed", incidentId: incident._id, userId: req.user._id, metadata: { reason } });
    emit("incident:updated", incidentBroadcast(incident));
    res.json({ success: true, data: { incidentId: incident.publicId, status: incident.status } });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/incidents/:id/report  (PDF) ──
const getReport = async (req, res, next) => {
  try {
    const report = require("../services/report.service");
    const incident = await report.loadIncident(String(req.params.id));
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${incident.publicId}_report.pdf"`);
    report.buildPdf(incident, res);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/accept ─────────────────────────────────────────
const acceptAssignment = async (req, res, next) => {
  try {
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (!isCommand(req.user) && !(await isAssignedResponder(req.user, incident))) {
      return fail(res, 403, "This incident is not assigned to you", "FORBIDDEN");
    }
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Incident is already closed", "INVALID_STATUS_TRANSITION");

    const owned = new Set((await responderResourceIds(req.user)).map(String));
    let accepted = 0;
    for (const ar of incident.assignedResources) {
      const mine = isCommand(req.user) || owned.size === 0 || owned.has(String(ar.resourceId));
      if (mine && ar.status === "assigned") {
        ar.status = "accepted";
        accepted++;
      }
    }
    if (accepted === 0) return fail(res, 400, "Nothing to accept — assignment already accepted", "INVALID_STATUS_TRANSITION");

    incident.timeline.push({ event: "assignment_accepted", message: `${req.user.name} accepted the assignment`, performedBy: req.user._id, timestamp: new Date() });
    await incident.save();

    emit("incident:updated", incidentBroadcast(incident, { assignmentAccepted: true }));
    res.json({ success: true, data: { publicId: incident.publicId, accepted } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/escalate ───────────────────────────────────────
const escalateIncident = async (req, res, next) => {
  try {
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");
    if (TERMINAL_STATUSES.includes(incident.status)) return fail(res, 400, "Cannot escalate a closed incident", "INVALID_STATUS_TRANSITION");

    incident.escalation.isEscalated = true;
    incident.escalation.level = "critical";
    incident.escalation.reason = reason || "Manual escalation by operator";
    incident.escalation.escalatedAt = new Date();
    incident.escalation.escalatedBy = req.user._id;
    incident.timeline.push({ event: "escalated", message: `Incident manually escalated: ${reason || "No reason provided"}`, performedBy: req.user._id, timestamp: new Date() });
    await incident.save();

    const alert = await createAlert({
      type: "escalation_critical",
      severity: "critical",
      title: `ESCALATED — ${incident.priority} Incident`,
      message: `Incident ${incident.publicId} has been escalated: ${reason || "Manual escalation"}`,
      incidentId: incident._id,
    });
    await AnalyticsEvent.create({ eventType: "incident_escalated", incidentId: incident._id, userId: req.user._id, metadata: { manual: true, reason } });

    await broadcastAlert(alert, incident);
    emit("incident:updated", incidentBroadcast(incident, { escalation: incident.escalation }));

    res.json({ success: true, data: { incidentId: incident.publicId, escalationLevel: "critical", alertCreated: true } });
  } catch (err) {
    next(err);
  }
};

// ── resolve (shared by /resolve and /status → RESOLVED) ───────────────────────
async function performResolve(incident, user, note) {
  const prevStatus = incident.status;
  incident.status = "RESOLVED";
  incident.resolution.resolvedAt = new Date();
  incident.resolution.resolvedBy = user._id;
  incident.resolution.resolutionNote = note || null;
  incident.timeline.push({
    event: "resolved",
    message: note || "Incident resolved",
    performedBy: user._id,
    timestamp: new Date(),
    metadata: { previousStatus: prevStatus, newStatus: "RESOLVED" },
  });
  await releaseResources(incident);
  await incident.save();

  await AnalyticsEvent.create({
    eventType: "incident_resolved",
    incidentId: incident._id,
    userId: user._id,
    metadata: { type: incident.type, severity: incident.severity, priority: incident.priority },
  });
  await notifications.run(notifications.notifyResolved(incident));
  emit("incident:updated", incidentBroadcast(incident));
  emit("incident:resolved", { incidentId: incident.publicId, publicId: incident.publicId, status: "RESOLVED", resolvedAt: incident.resolution.resolvedAt });
}

// ── POST /api/v1/incidents/:id/resolve ────────────────────────────────────────
const resolveIncident = async (req, res, next) => {
  try {
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");

    if (!isCommand(req.user) && !(await isAssignedResponder(req.user, incident))) {
      return fail(res, 403, "You can only resolve incidents assigned to you", "FORBIDDEN");
    }
    const validFrom = ["ASSIGNED", "EN_ROUTE", "ON_SCENE", "CLASSIFIED", "REPORTED", "DUPLICATE_CANDIDATE"];
    if (!validFrom.includes(incident.status)) {
      return fail(res, 400, `Cannot resolve incident with status ${incident.status}`, "INVALID_STATUS_TRANSITION");
    }

    await performResolve(incident, req.user, note);
    res.json({ success: true, data: { publicId: incident.publicId, status: "RESOLVED", resolvedAt: incident.resolution.resolvedAt } });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/incidents/:id/status ─────────────────────────────────────────
const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const note = typeof req.body.note === "string" ? req.body.note.trim().slice(0, 500) : "";
    const incident = await findByPublicId(req.params.id);
    if (!incident) return fail(res, 404, "Incident not found", "INCIDENT_NOT_FOUND");

    // Only command staff, or the responder this incident is assigned to, may change status
    const command = isCommand(req.user);
    if (!command && !(await isAssignedResponder(req.user, incident))) {
      return fail(res, 403, "You do not have permission to update this incident", "FORBIDDEN");
    }

    const allowed = VALID_TRANSITIONS[incident.status] || [];
    if (!allowed.includes(status)) {
      return fail(res, 400, `Invalid status transition: ${incident.status} → ${status}`, "INVALID_STATUS_TRANSITION");
    }
    if (status === "CLOSED" && !command) return fail(res, 403, "Only operators can close incidents", "FORBIDDEN");

    if (status === "RESOLVED") {
      await performResolve(incident, req.user, note);
      return res.json({ success: true, data: { publicId: incident.publicId, status: "RESOLVED", updatedAt: incident.updatedAt } });
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

    // Propagate to dispatched units. A responder moves only their own units (command staff move all of them).
    const unitStatus = { EN_ROUTE: "en_route", ON_SCENE: "on_scene" }[status];
    if (unitStatus) {
      const owned = new Set((await responderResourceIds(req.user)).map(String));
      for (const ar of incident.assignedResources) {
        if (["completed", "cancelled"].includes(ar.status)) continue;
        const mine = command || owned.size === 0 || owned.has(String(ar.resourceId));
        if (!mine) continue;
        ar.status = unitStatus;
        const r = await Resource.findOneAndUpdate({ _id: ar.resourceId, currentIncident: incident._id }, { status: unitStatus }, { new: true });
        if (r) emit("resource:updated", { resourceId: r.publicId, status: unitStatus, incidentId: incident.publicId });
      }
    }

    await incident.save();
    emit("incident:updated", incidentBroadcast(incident));
    res.json({ success: true, data: { publicId: incident.publicId, status, updatedAt: incident.updatedAt } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getReport,
  autoDispatchIncident,
  recallIncident,
  dismissIncident,
  createIncident,
  getIncidents,
  getIncident,
  updateIncident,
  classifyIncident,
  regenerateSummary,
  mergeIncident,
  unmergeIncident,
  rejectDuplicate,
  assignIncident,
  acceptAssignment,
  escalateIncident,
  resolveIncident,
  updateStatus,
  publicView,
  setIO,
};
