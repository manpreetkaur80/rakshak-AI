/**
 * Dispatching units to incidents – shared by the manual "assign" endpoint and auto-dispatch.
 * Units are claimed atomically, so a busy unit can never be double-booked.
 */
const Resource = require("../models/Resource");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const notifications = require("./notification.service");
const config = require("./config.service");
const { getRecommendations } = require("./resource.service");

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const PRIORITY_RANK = { P1: 1, P2: 2, P3: 3, P4: 4 };

let io = null;
const setIO = (rt) => { io = rt; };
const emit = (event, data) => { if (io) io.emit(event, data); };

const incidentBroadcast = (i) => ({
  publicId: i.publicId, type: i.type, severity: i.severity, priority: i.priority, status: i.status,
  title: i.title, address: i.address, location: i.location, updatedAt: i.updatedAt,
});

/**
 * @param incident  Mongoose document (saved by this function)
 * @param resourceIds  public or object ids
 * @param opts { user (performer, may be null for system), responderId, auto }
 */
async function dispatchUnits(incident, resourceIds, { user = null, responderId = null, auto = false } = {}) {
  const assignedIds = [];
  const skipped = [];
  let firstResponderUser = null;
  const by = user ? user._id : null;

  for (const rid of resourceIds.map(String)) {
    const idQuery = OBJECT_ID.test(rid) ? { $or: [{ publicId: rid }, { _id: rid }] } : { publicId: rid };
    const resource = await Resource.findOneAndUpdate(
      { ...idQuery, status: "available", type: { $ne: "hospital" } },
      { status: "assigned", currentIncident: incident._id, "availability.isAvailable": false, "availability.lastUpdated": new Date() },
      { new: true }
    );
    if (!resource) { skipped.push(rid); continue; }

    incident.assignedResources.push({ resourceId: resource._id, assignedAt: new Date(), assignedBy: by, status: "assigned" });
    assignedIds.push(resource.publicId);
    if (!firstResponderUser && resource.responderUser) firstResponderUser = resource.responderUser;

    emit("resource:updated", { resourceId: resource.publicId, status: "assigned", incidentId: incident.publicId });
    await AnalyticsEvent.create({ eventType: "resource_assigned", incidentId: incident._id, resourceId: resource._id, userId: by, metadata: { resourceType: resource.type, auto } });
  }

  if (assignedIds.length === 0) return { assignedIds, skipped };

  if (responderId && OBJECT_ID.test(String(responderId))) incident.assignedResponder = responderId;
  else if (!incident.assignedResponder && firstResponderUser) incident.assignedResponder = firstResponderUser;

  if (["REPORTED", "CLASSIFIED", "DUPLICATE_CANDIDATE", "ASSIGNED"].includes(incident.status)) incident.status = "ASSIGNED";
  if (auto) incident.autoDispatched = true;
  incident.timeline.push({
    event: "resource_assigned",
    message: `${auto ? "Auto-dispatch: " : ""}Resources assigned: ${assignedIds.join(", ")}`,
    performedBy: by,
    timestamp: new Date(),
    metadata: { newStatus: incident.status, resources: assignedIds, auto },
  });
  await incident.save();

  const dispatched = await Resource.find({ publicId: { $in: assignedIds } }).select("publicId responderUser");
  await notifications.run(notifications.notifyDispatch(incident, dispatched));

  emit("incident:assigned", { incidentId: incident.publicId, resourceIds: assignedIds, status: incident.status });
  emit("incident:updated", incidentBroadcast(incident));
  return { assignedIds, skipped };
}

/** The recommended response package for an incident, as resource ids. */
async function recommendedIds(incident) {
  const recs = await getRecommendations(incident);
  return recs.map((r) => r.resource.publicId);
}

/** Dispatch the recommended package on behalf of the system if auto-dispatch is enabled and the incident qualifies. */
async function maybeAutoDispatch(incident) {
  const cfg = config.getAutoDispatchConfig();
  if (!cfg.enabled) return null;
  if (PRIORITY_RANK[incident.priority] > PRIORITY_RANK[cfg.minPriority]) return null;
  if (incident.assignedResources.length > 0) return null;
  const ids = await recommendedIds(incident);
  if (ids.length === 0) return null;
  const result = await dispatchUnits(incident, ids, { auto: true });
  if (result.assignedIds.length) {
    await AnalyticsEvent.create({ eventType: "auto_dispatch", incidentId: incident._id, metadata: { resources: result.assignedIds } });
  }
  return result;
}

/** Operator override: take back units that have not finished their job. */
async function recallUnits(incident, user) {
  const released = [];
  for (const ar of incident.assignedResources) {
    if (["completed", "cancelled"].includes(ar.status)) continue;
    const rid = ar.resourceId && (ar.resourceId._id || ar.resourceId);
    ar.status = "cancelled";
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
  if (released.length === 0) return released;
  incident.autoDispatched = false;
  incident.assignedResponder = null;
  if (["ASSIGNED", "EN_ROUTE"].includes(incident.status)) incident.status = "CLASSIFIED";
  incident.timeline.push({
    event: "dispatch_recalled",
    message: `Dispatch recalled by operator (${released.join(", ")})`,
    performedBy: user ? user._id : null,
    timestamp: new Date(),
    metadata: { newStatus: incident.status, resources: released },
  });
  await incident.save();
  await AnalyticsEvent.create({ eventType: "dispatch_recalled", incidentId: incident._id, userId: user ? user._id : null, metadata: { resources: released } });
  emit("incident:updated", incidentBroadcast(incident));
  return released;
}

module.exports = { setIO, dispatchUnits, recommendedIds, maybeAutoDispatch, recallUnits };
