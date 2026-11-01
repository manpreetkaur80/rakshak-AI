const crypto = require("crypto");
const SourceReport = require("../models/SourceReport");
const Incident = require("../models/Incident");
const { ingestReport, attachSensorReading } = require("../services/incident.service");
const { normalize, samplePayload, SOURCES } = require("../services/ingest.service");

const fail = (res, status, message, code = "VALIDATION_ERROR") => res.status(status).json({ success: false, message, code });
const SENSOR_ATTACH_WINDOW_MS = 15 * 60 * 1000;

/** Runs one normalised payload through the pipeline. */
async function processFeed(source, payload, user) {
  const n = normalize(source, payload);
  if (n.ignored) return { ignored: n.ignored };

  // Idempotency: a feed that retries the same eventId must not create a second report
  const eventId = n.metadata && n.metadata.eventId;
  if (eventId) {
    const existing = await SourceReport.findOne({ sourceType: n.sourceType, "metadata.eventId": eventId }).populate("incidentId", "publicId");
    if (existing && existing.incidentId) return { duplicateEvent: true, incidentId: existing.incidentId.publicId, sourceType: n.sourceType };
  }

  // Repeated alarms from the same sensor feed the incident it already opened
  if (n.sourceType === "sensor" && n.sourceRef) {
    const recent = await SourceReport.findOne({ sourceType: "sensor", sourceRef: n.sourceRef, createdAt: { $gte: new Date(Date.now() - SENSOR_ATTACH_WINDOW_MS) }, incidentId: { $ne: null } }).sort({ createdAt: -1 });
    if (recent) {
      const incident = await Incident.findOne({ _id: recent.incidentId, status: { $nin: ["RESOLVED", "CLOSED", "MERGED"] } });
      if (incident) {
        const report = await attachSensorReading(incident, { description: n.description, coordinates: n.coordinates, sourceRef: n.sourceRef, metadata: n.metadata, severityHint: n.severityHint });
        return { incidentId: incident.publicId, created: false, attached: true, sourceType: n.sourceType, sourceReportId: report.publicId };
      }
    }
  }

  const { incident, sourceReport } = await ingestReport({
    description: n.description, coordinates: n.coordinates, typeHint: n.typeHint, address: n.address,
    user, sourceType: n.sourceType, sourceRef: n.sourceRef, severityHint: n.severityHint, metadata: n.metadata,
  });
  return { incidentId: incident.publicId, created: true, status: incident.status, sourceType: n.sourceType, sourceReportId: sourceReport.publicId, type: incident.type, severity: incident.severity };
}

// POST /ingest/:source  (API key or staff JWT — see ingest.routes)
const ingest = async (req, res, next) => {
  try {
    const result = await processFeed(req.params.source, req.body || {}, null);
    if (result.ignored) return res.status(202).json({ success: true, data: { ignored: true, reason: result.ignored } });
    if (result.duplicateEvent) return res.status(200).json({ success: true, data: { ...result, created: false } });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// POST /ingest/simulate/:source  and  /ingest/simulate-scenario  (operator/admin demo tools)
const simulate = async (req, res, next) => {
  try {
    const { source, scenario, near } = req.body || {};

    if (scenario) {
      if (scenario !== "multi_source_fire") return fail(res, 400, 'Unknown scenario (use "multi_source_fire")');
      // The problem-statement story: emergency call + citizen app + smoke sensor + hospital feed within seconds
      res.status(202).json({ success: true, data: { started: true, scenario } });
      const steps = [
        () => processFeed("call", samplePayload("call", near)),
        () => ingestReport({ description: "Fire near Central Market with a lot of smoke, people are panicking", coordinates: (() => { const p = samplePayload("sensor", near).location; return [p.lng, p.lat]; })(), typeHint: "fire", address: "Central Market", sourceType: "web" }),
        () => processFeed("sensor", samplePayload("sensor", near)),
        () => processFeed("hospital", samplePayload("hospital", near)),
      ];
      steps.forEach((step, i) => setTimeout(() => step().catch((e) => console.error("Scenario step failed:", e.message)), i * 2500));
      return;
    }

    if (!SOURCES.includes(source)) return fail(res, 400, `source must be one of: ${SOURCES.join(", ")}`);
    const result = await processFeed(source, samplePayload(source, near), null);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
};

// GET /ingest/sources — how many reports each feed delivered in the last 24 h
const sources = async (req, res, next) => {
  try {
    const rows = await SourceReport.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 24 * 3600 * 1000) } } },
      { $group: { _id: "$sourceType", count: { $sum: 1 }, lastAt: { $max: "$createdAt" } } },
      { $sort: { count: -1 } },
    ]);
    res.json({ success: true, data: rows.map((r) => ({ sourceType: r._id, count: r.count, lastAt: r.lastAt })) });
  } catch (err) { next(err); }
};

// Constant-time API key check
function validApiKey(provided) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { ingest, simulate, sources, validApiKey, processFeed };
