/**
 * Core "report → incident" pipeline shared by the web form and every ingestion feed:
 *   normalize → classify → (severity hint) → create incident → duplicate check → alerts → events
 */
const Incident = require("../models/Incident");
const SourceReport = require("../models/SourceReport");
const AnalyticsEvent = require("../models/AnalyticsEvent");
const { classify } = require("./ai.service");
const { findDuplicateCandidates } = require("./duplicate.service");
const { createAlert } = require("./alert.service");
const notifications = require("./notification.service");
const credibilityService = require("./credibility.service");

const VALID_TYPES = ["fire", "flood", "medical", "accident", "industrial", "structural", "other"];
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const PRIORITY_OF = { critical: "P1", high: "P2", medium: "P3", low: "P4" };

const SOURCE_LABEL = {
  web: "citizen app", call: "emergency call", sensor: "IoT sensor",
  hospital: "hospital feed", govt: "government alert", field_team: "field team",
};

let io = null;
const setIO = (rt) => { io = rt; };
const emit = (event, data) => { if (io) io.emit(event, data); };

async function broadcastAlert(alert, incident) {
  emit("alert:created", {
    id: alert._id, publicId: alert.publicId, type: alert.type, severity: alert.severity,
    title: alert.title, message: alert.message, incidentId: incident.publicId, acknowledged: false,
  });
}

/**
 * @param {object} r
 * @param {string} r.description
 * @param {[number,number]} r.coordinates   [lon, lat], already validated
 * @param {string} [r.typeHint]
 * @param {string} [r.address]
 * @param {string|null} [r.imageUrl]
 * @param {object|null} [r.user]            signed-in user, if any
 * @param {string} [r.sourceType]           web|call|sensor|hospital|govt|field_team
 * @param {string|null} [r.sourceRef]
 * @param {string|null} [r.severityHint]    minimum severity from the feed (e.g. sensor reading far above threshold)
 * @param {object} [r.metadata]
 */
async function ingestReport(r) {
  const typeHint = VALID_TYPES.includes(r.typeHint) ? r.typeHint : "";
  const sourceType = r.sourceType || "web";
  const user = r.user || null;
  const reportedBy = user ? user._id : null;
  const reporterType = !user ? "anonymous" : user.role === "citizen" ? "citizen" : "staff";
  const point = { type: "Point", coordinates: r.coordinates };
  const address = (r.address || "").slice(0, 200);

  const sourceReport = await SourceReport.create({
    reportedBy, reporterType, sourceType, sourceRef: r.sourceRef || null,
    description: r.description, typeHint, location: point, address,
    imageUrl: r.imageUrl || null,
    metadata: { source: sourceType, ...(r.metadata || {}) },
  });

  let aiResult = null;
  try {
    aiResult = await classify(r.description, typeHint);
  } catch (err) {
    console.error("Classification failed:", err.message);
  }

  const finalType = (aiResult && aiResult.type !== "other" ? aiResult.type : typeHint) || (aiResult && aiResult.type) || "other";

  // A feed can only RAISE urgency (e.g. a sensor reading 3× its threshold), never lower it
  let severity = (aiResult && aiResult.severity) || "medium";
  let priority = (aiResult && aiResult.priority) || "P3";
  if (r.severityHint && SEVERITY_RANK[r.severityHint] > SEVERITY_RANK[severity]) {
    severity = r.severityHint;
    priority = PRIORITY_OF[severity];
  }

  let credibility = null;
  try {
    credibility = await credibilityService.assess({
      description: r.description, sourceType, user, coordinates: r.coordinates, hasImage: !!r.imageUrl, typeHint,
    });
  } catch (err) {
    console.error("Credibility check failed:", err.message);
  }

  const title = `${finalType.charAt(0).toUpperCase() + finalType.slice(1)} reported near ${address || "reported location"}`;
  const via = sourceType === "web" ? "" : ` (via ${SOURCE_LABEL[sourceType] || sourceType})`;

  const incident = await Incident.create({
    type: finalType, severity, priority, status: "REPORTED", title,
    description: r.description, location: point, address, imageUrl: r.imageUrl || null,
    sourceReports: [sourceReport._id],
    credibility: credibility || undefined,
    aiClassification: aiResult ? {
      type: aiResult.type, severity: aiResult.severity, priority: aiResult.priority, confidence: aiResult.confidence,
      summary: aiResult.summary, recommendedActions: aiResult.recommendedActions, provider: aiResult.provider,
      isFallback: aiResult.isFallback, classifiedAt: new Date(),
    } : null,
    timeline: [{ event: "incident_created", message: `Emergency report received${via}`, performedBy: reportedBy, timestamp: new Date() }],
    createdBy: reportedBy,
  });
  await SourceReport.findByIdAndUpdate(sourceReport._id, { incidentId: incident._id });

  if (aiResult) {
    incident.status = "CLASSIFIED";
    incident.timeline.push({
      event: "classified",
      message: `Incident classified as ${severity} ${finalType} by ${aiResult.isFallback ? "rule engine" : "AI"}`,
      timestamp: new Date(),
      metadata: { provider: aiResult.provider, confidence: aiResult.confidence, newStatus: "CLASSIFIED" },
    });
    await incident.save();
  }

  // Duplicate detection must never lose the report
  let duplicates = [];
  try {
    duplicates = await findDuplicateCandidates(incident);
  } catch (err) {
    console.error("Duplicate detection failed:", err.message);
  }

  if (duplicates.length > 0) {
    incident.duplicateCandidates = duplicates.map(({ publicId, ...d }) => d);
    incident.status = "DUPLICATE_CANDIDATE";
    incident.timeline.push({
      event: "duplicate_detected", message: `${duplicates.length} possible duplicate(s) detected`,
      timestamp: new Date(), metadata: { count: duplicates.length, topScore: duplicates[0].score },
    });
    await incident.save();

    const alert = await createAlert({
      type: "duplicate_candidate", severity: "warning", title: "Possible Duplicate Incident",
      message: `Incident ${incident.publicId} may be a duplicate of ${duplicates[0].publicId || "an existing incident"} (score: ${Math.round(duplicates[0].score * 100)}%)`,
      incidentId: incident._id,
    });
    await broadcastAlert(alert, incident);
    await AnalyticsEvent.create({ eventType: "duplicate_detected", incidentId: incident._id, metadata: { count: duplicates.length, topScore: duplicates[0].score } });
  } else if (incident.priority === "P1" && credibility && credibility.level === "low") {
    // Probably a prank – warn operators instead of raising a P1 alarm / paging people
    const alert = await createAlert({
      type: "critical_incident", severity: "warning",
      title: "Low-credibility report",
      message: `${incident.publicId} was reported as ${incident.priority} but looks suspicious: ${credibility.flags.join("; ") || "low credibility"}. Please verify before dispatching.`,
      incidentId: incident._id,
    });
    await broadcastAlert(alert, incident);
  } else if (incident.priority === "P1") {
    const alert = await createAlert({
      type: "critical_incident", severity: "critical",
      title: `P1 ${finalType.toUpperCase()} — immediate attention`,
      message: `New P1 incident ${incident.publicId} (${finalType}) at ${address || "reported location"}${via}.`,
      incidentId: incident._id,
    });
    await broadcastAlert(alert, incident);
  }

  await AnalyticsEvent.create({ eventType: "incident_created", incidentId: incident._id, userId: reportedBy, metadata: { type: incident.type, severity: incident.severity, sourceType } });
  if (aiResult) {
    await AnalyticsEvent.create({
      eventType: aiResult.isFallback ? "ai_classification_fallback" : "ai_classification_success",
      incidentId: incident._id, metadata: { provider: aiResult.provider, confidence: aiResult.confidence },
    });
  }

  // Hospitals get an early heads-up about possible casualties (not for suspected duplicates)
  const lowCredibility = credibility && credibility.level === "low";
  if (duplicates.length === 0 && !lowCredibility) await notifications.run(notifications.notifyHospitals(incident));

  // Optional automatic dispatch (human can recall). Never for suspected duplicates or suspicious reports.
  if (duplicates.length === 0 && !lowCredibility) {
    try {
      await require("./dispatch.service").maybeAutoDispatch(incident);
    } catch (err) {
      console.error("Auto-dispatch failed:", err.message);
    }
  }

  emit("incident:created", {
    publicId: incident.publicId, type: incident.type, severity: incident.severity, priority: incident.priority,
    status: incident.status, title: incident.title, address: incident.address, location: incident.location,
    createdAt: incident.createdAt, sourceType,
  });
  if (aiResult) emit("incident:classified", { publicId: incident.publicId, aiClassification: incident.aiClassification });

  return { incident, sourceReport, aiResult, duplicates };
}

/**
 * Adds another reading from the SAME sensor to an incident it already triggered
 * (instead of opening a new incident for every repeated alarm).
 */
async function attachSensorReading(incident, { description, coordinates, sourceRef, metadata, severityHint }) {
  const point = { type: "Point", coordinates };
  const report = await SourceReport.create({
    incidentId: incident._id, reporterType: "anonymous", sourceType: "sensor", sourceRef,
    description, location: point, address: incident.address, metadata: { source: "sensor", ...(metadata || {}) },
  });
  incident.sourceReports.push(report._id);
  incident.timeline.push({ event: "sensor_reading", message: `Additional reading from sensor ${sourceRef}`, timestamp: new Date() });
  if (severityHint && SEVERITY_RANK[severityHint] > SEVERITY_RANK[incident.severity]) {
    incident.severity = severityHint;
    incident.priority = PRIORITY_OF[severityHint];
    incident.timeline.push({ event: "operator_override", message: `Severity raised to ${severityHint} by sensor readings`, timestamp: new Date() });
  }
  await incident.save();
  emit("incident:updated", {
    publicId: incident.publicId, type: incident.type, severity: incident.severity, priority: incident.priority,
    status: incident.status, updatedAt: incident.updatedAt,
  });
  return report;
}

module.exports = { ingestReport, attachSensorReading, setIO, SOURCE_LABEL, SEVERITY_RANK, PRIORITY_OF, VALID_TYPES };
