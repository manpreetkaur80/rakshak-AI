/**
 * Demo simulation controller — Market Fire scenario
 */
const Incident = require("../models/Incident");
const SourceReport = require("../models/SourceReport");
const Resource = require("../models/Resource");
const User = require("../models/User");
const { classify } = require("../services/ai.service");
const { findDuplicateCandidates } = require("../services/duplicate.service");
const { createAlert } = require("../services/alert.service");
const AnalyticsEvent = require("../models/AnalyticsEvent");

let io = null;
function setIO(socketIO) { io = socketIO; }
function emit(event, data) { if (io) io.emit(event, data); }

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MARKET_COORDS = [72.5714, 23.0225]; // Synthetic Ahmedabad market

// POST /api/v1/demo/market-fire
const startMarketFireSimulation = async (req, res, next) => {
  try {
    const citizen = await User.findOne({ role: "citizen" });
    const operator = await User.findOne({ role: "operator" });
    if (!citizen || !operator) {
      return res.status(400).json({ success: false, message: "Seed data required. Run npm run seed first.", code: "VALIDATION_ERROR" });
    }

    const simulationId = `DEMO-${Date.now()}`;
    res.json({ success: true, data: { simulationId, scenario: "market_fire", status: "started" } });

    // Run simulation asynchronously
    runMarketFireSimulation(simulationId, citizen, operator).catch((err) => {
      console.error("Market fire simulation error:", err.message);
    });
  } catch (err) {
    next(err);
  }
};

async function runMarketFireSimulation(simulationId, citizen, operator) {
  try {
    console.log(`[DEMO] Starting market fire simulation ${simulationId}`);
    emit("demo:started", { simulationId, scenario: "market_fire" });

    // T+0: First citizen report
    const report1 = await SourceReport.create({
      reportedBy: citizen._id,
      description: "There is a large fire near the synthetic market and people may be trapped inside. Heavy smoke visible.",
      typeHint: "fire",
      location: { type: "Point", coordinates: MARKET_COORDS },
      address: "Synthetic Market Road, Ahmedabad",
      metadata: { source: "demo", simulationId },
    });

    const ai1 = await classify(report1.description, "fire");
    const incident1 = await Incident.create({
      type: ai1.type || "fire",
      severity: ai1.severity || "critical",
      priority: ai1.priority || "P1",
      status: "CLASSIFIED",
      title: "Fire reported near Synthetic Market",
      description: report1.description,
      location: { type: "Point", coordinates: MARKET_COORDS },
      address: "Synthetic Market Road, Ahmedabad",
      sourceReports: [report1._id],
      aiClassification: { ...ai1, classifiedAt: new Date() },
      timeline: [
        { event: "incident_created", message: "Emergency report received (DEMO)", timestamp: new Date() },
        { event: "classified", message: `Classified as critical fire (${ai1.isFallback ? "rule-based" : "AI"})`, timestamp: new Date() },
      ],
      isDemo: true,
      createdBy: citizen._id,
    });
    await SourceReport.findByIdAndUpdate(report1._id, { incidentId: incident1._id });

    emit("incident:created", { publicId: incident1.publicId, type: "fire", severity: "critical", priority: "P1", status: "CLASSIFIED", title: incident1.title, isDemo: true });
    emit("incident:classified", { publicId: incident1.publicId, aiClassification: incident1.aiClassification });
    emit("demo:step", { step: 1, message: "T+0: First citizen report received and classified as critical fire", incidentId: incident1.publicId });
    console.log(`[DEMO] Step 1: Incident ${incident1.publicId} created`);

    await delay(5000);

    // T+5s: Second citizen report (nearby)
    const coords2 = [MARKET_COORDS[0] + 0.001, MARKET_COORDS[1] + 0.001]; // ~140m away
    const report2 = await SourceReport.create({
      reportedBy: citizen._id,
      description: "Smoke and flames are spreading near the synthetic market area. Can see fire from the main road.",
      typeHint: "fire",
      location: { type: "Point", coordinates: coords2 },
      address: "Near Synthetic Market, Ahmedabad",
      metadata: { source: "demo", simulationId },
    });

    const ai2 = await classify(report2.description, "fire");
    const incident2 = await Incident.create({
      type: "fire",
      severity: "critical",
      priority: "P1",
      status: "CLASSIFIED",
      title: "Fire reported near Synthetic Market (Report 2)",
      description: report2.description,
      location: { type: "Point", coordinates: coords2 },
      address: "Near Synthetic Market, Ahmedabad",
      sourceReports: [report2._id],
      aiClassification: { ...ai2, classifiedAt: new Date() },
      timeline: [
        { event: "incident_created", message: "Second emergency report received (DEMO)", timestamp: new Date() },
        { event: "classified", message: "Classified as critical fire", timestamp: new Date() },
      ],
      isDemo: true,
      createdBy: citizen._id,
    });
    await SourceReport.findByIdAndUpdate(report2._id, { incidentId: incident2._id });

    emit("incident:created", { publicId: incident2.publicId, type: "fire", severity: "critical", priority: "P1", status: "CLASSIFIED", isDemo: true });
    emit("demo:step", { step: 2, message: `T+5s: Second report received (${incident2.publicId})`, incidentId: incident2.publicId });
    console.log(`[DEMO] Step 2: Second incident ${incident2.publicId} created`);

    await delay(5000);

    // T+10s: Duplicate detection
    const duplicates = await findDuplicateCandidates(incident2);
    let mergedOk = false;

    if (duplicates.length > 0) {
      incident2.duplicateCandidates = duplicates.map((d) => ({
        incidentId: d.incidentId,
        score: d.score,
        locationScore: d.locationScore,
        timeScore: d.timeScore,
        textScore: d.textScore,
        status: "pending",
        detectedAt: new Date(),
      }));
      incident2.status = "DUPLICATE_CANDIDATE";
      incident2.timeline.push({ event: "duplicate_detected", message: `Duplicate candidate detected: ${duplicates[0].publicId || incident1.publicId}`, timestamp: new Date() });
      await incident2.save();

      const dupAlert = await createAlert({
        type: "duplicate_candidate",
        severity: "warning",
        title: "Possible Duplicate — Market Fire",
        message: `Incident ${incident2.publicId} may be a duplicate of ${incident1.publicId} (score: ${Math.round((duplicates[0].score || 0.8) * 100)}%)`,
        incidentId: incident2._id,
      });

      emit("alert:created", { publicId: dupAlert.publicId, type: "duplicate_candidate", severity: "warning", message: dupAlert.message, incidentId: incident1.publicId });
      emit("incident:updated", { publicId: incident2.publicId, status: "DUPLICATE_CANDIDATE", duplicateCandidates: incident2.duplicateCandidates });
      emit("demo:step", { step: 3, message: `T+10s: Duplicate candidate detected! Score: ${Math.round((duplicates[0].score || 0.8) * 100)}%`, incidentId: incident1.publicId });
      console.log(`[DEMO] Step 3: Duplicate detected`);
      mergedOk = true;
    } else {
      emit("demo:step", { step: 3, message: "T+10s: No duplicate detected (likely already seeded data nearby) — continuing simulation", incidentId: incident1.publicId });
    }

    await delay(5000);

    // T+15s: Operator merges (simulated)
    if (mergedOk) {
      incident1.sourceReports.push(...incident2.sourceReports);
      incident2.status = "MERGED";
      incident2.timeline.push({ event: "merged", message: `Merged into ${incident1.publicId} by demo operator`, timestamp: new Date() });
      await incident2.save();

      incident1.timeline.push({ event: "duplicate_confirmed", message: `Report ${incident2.publicId} merged by demo operator`, timestamp: new Date() });
      if (incident1.status === "DUPLICATE_CANDIDATE") incident1.status = "CLASSIFIED";
      await incident1.save();

      emit("incident:updated", { publicId: incident1.publicId, status: incident1.status, updatedAt: new Date() });
      emit("incident:updated", { publicId: incident2.publicId, status: "MERGED" });
      emit("demo:step", { step: 4, message: `T+15s: Operator merged ${incident2.publicId} into ${incident1.publicId}`, incidentId: incident1.publicId });
      console.log(`[DEMO] Step 4: Reports merged`);
    }

    await delay(5000);

    // T+20s: Resource recommendation & dispatch
    const { getRecommendations } = require("../services/resource.service");
    const recommendations = await getRecommendations(incident1);

    emit("demo:step", { step: 5, message: `T+20s: ${recommendations.length} resources recommended`, incidentId: incident1.publicId });
    console.log(`[DEMO] Step 5: ${recommendations.length} resources recommended`);

    await delay(5000);

    // T+25s: Auto-dispatch top resources (fire team + ambulance)
    const toAssign = recommendations.slice(0, 2);
    const assignedPublicIds = [];

    for (const rec of toAssign) {
      const resource = await Resource.findById(rec.resource._id);
      if (!resource || resource.status !== "available") continue;
      resource.status = "assigned";
      resource.currentIncident = incident1._id;
      resource.availability.isAvailable = false;
      await resource.save();

      incident1.assignedResources.push({
        resourceId: resource._id,
        assignedAt: new Date(),
        assignedBy: operator._id,
        status: "assigned",
      });
      assignedPublicIds.push(resource.publicId);
      emit("resource:updated", { resourceId: resource.publicId, status: "assigned", incidentId: incident1.publicId });
    }

    if (assignedPublicIds.length > 0) {
      incident1.status = "ASSIGNED";
      incident1.timeline.push({
        event: "resource_assigned",
        message: `Demo dispatch: ${assignedPublicIds.join(", ")}`,
        performedBy: operator._id,
        timestamp: new Date(),
        metadata: { newStatus: "ASSIGNED", resources: assignedPublicIds },
      });
      await incident1.save();
      emit("incident:assigned", { incidentId: incident1.publicId, resourceIds: assignedPublicIds, status: "ASSIGNED" });
      emit("demo:step", { step: 6, message: `T+25s: Resources dispatched: ${assignedPublicIds.join(", ")}`, incidentId: incident1.publicId });
      console.log(`[DEMO] Step 6: Dispatched ${assignedPublicIds.join(", ")}`);
    }

    await delay(10000);

    // T+35s: EN_ROUTE
    incident1.status = "EN_ROUTE";
    incident1.timeline.push({ event: "status_changed", message: "Responder en route to incident", timestamp: new Date(), metadata: { newStatus: "EN_ROUTE" } });
    await incident1.save();
    for (const ar of incident1.assignedResources) {
      await Resource.findByIdAndUpdate(ar.resourceId, { status: "en_route" });
    }
    emit("incident:updated", { publicId: incident1.publicId, status: "EN_ROUTE", updatedAt: new Date() });
    emit("demo:step", { step: 7, message: "T+35s: Responder is EN ROUTE", incidentId: incident1.publicId });
    console.log("[DEMO] Step 7: EN_ROUTE");

    await delay(20000);

    // T+55s: ON_SCENE
    incident1.status = "ON_SCENE";
    incident1.timeline.push({ event: "status_changed", message: "Responder arrived on scene", timestamp: new Date(), metadata: { newStatus: "ON_SCENE" } });
    await incident1.save();
    for (const ar of incident1.assignedResources) {
      await Resource.findByIdAndUpdate(ar.resourceId, { status: "on_scene" });
    }
    emit("incident:updated", { publicId: incident1.publicId, status: "ON_SCENE", updatedAt: new Date() });
    emit("demo:step", { step: 8, message: "T+55s: Responder ON SCENE", incidentId: incident1.publicId });
    console.log("[DEMO] Step 8: ON_SCENE");

    await delay(20000);

    // T+75s: RESOLVED
    incident1.status = "RESOLVED";
    incident1.resolution.resolvedAt = new Date();
    incident1.resolution.resolvedBy = operator._id;
    incident1.resolution.resolutionNote = "DEMO: Fire contained. No casualties. Incident resolved.";
    incident1.timeline.push({ event: "resolved", message: "DEMO: Fire contained and incident resolved", performedBy: operator._id, timestamp: new Date(), metadata: { newStatus: "RESOLVED" } });
    await incident1.save();

    for (const ar of incident1.assignedResources) {
      await Resource.findByIdAndUpdate(ar.resourceId, { status: "available", currentIncident: null, "availability.isAvailable": true });
      const res = await Resource.findById(ar.resourceId);
      if (res) emit("resource:updated", { resourceId: res.publicId, status: "available", incidentId: null });
    }

    await AnalyticsEvent.create({ eventType: "incident_resolved", incidentId: incident1._id, metadata: { isDemo: true } });

    emit("incident:resolved", { incidentId: incident1.publicId, status: "RESOLVED", resolvedAt: incident1.resolution.resolvedAt, isDemo: true });
    emit("demo:step", { step: 9, message: `T+75s: Incident RESOLVED. Demo complete! Incident: ${incident1.publicId}`, incidentId: incident1.publicId });
    emit("demo:completed", { simulationId, incidentId: incident1.publicId, message: "Market Fire simulation complete" });
    console.log(`[DEMO] Simulation complete: ${incident1.publicId}`);
  } catch (err) {
    console.error("[DEMO] Simulation error:", err.message);
    emit("demo:error", { simulationId, error: err.message });
  }
}

module.exports = { startMarketFireSimulation, setIO };
