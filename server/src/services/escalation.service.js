/**
 * Escalation service (runs every minute via cron).
 *
 *  1. Unassigned P1/P2 incidents: WARNING after `warningAfterMinutes`, then CRITICAL after
 *     `criticalAfterMinutes`. (Previously an incident was escalated once, as "warning", and
 *     could never reach "critical" because the query skipped already-escalated incidents.)
 *  2. Assigned P1/P2 incidents whose responders have not reached the scene within
 *     `onSceneAfterMinutes`: one "resource_delayed" alert.
 *
 * Thresholds are admin-editable (config.service).
 */

const cron = require("node-cron");
const Incident = require("../models/Incident");
const { createAlert } = require("./alert.service");
const { getEscalationConfig, getConfig } = require("./config.service");
const AnalyticsEvent = require("../models/AnalyticsEvent");

let io = null;

function setIO(socketIO) {
  io = socketIO;
}

const UNASSIGNED_STATUSES = ["REPORTED", "CLASSIFIED", "DUPLICATE_CANDIDATE"];
const WAITING_FOR_ARRIVAL_STATUSES = ["ASSIGNED", "EN_ROUTE"];

function broadcastAlert(alert, incident, extra = {}) {
  if (!io) return;
  io.emit("alert:created", {
    id: alert._id,
    publicId: alert.publicId,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    message: alert.message,
    incidentId: incident.publicId,
    acknowledged: false,
    ...extra,
  });
}

async function escalateUnassigned(now, priority, config) {
  const warningThreshold = new Date(now.getTime() - config.warningAfterMinutes * 60000);

  // Anything past the warning threshold that has not already been escalated to "critical"
  const incidents = await Incident.find({
    priority,
    status: { $in: UNASSIGNED_STATUSES },
    "escalation.level": { $ne: "critical" },
    createdAt: { $lte: warningThreshold },
  });

  let count = 0;
  for (const incident of incidents) {
    const ageMinutes = (now - incident.createdAt) / 60000;
    const targetLevel = ageMinutes >= config.criticalAfterMinutes ? "critical" : "warning";
    if (incident.escalation.level === targetLevel) continue; // already at this level

    const rounded = Math.round(ageMinutes);
    incident.escalation.isEscalated = true;
    incident.escalation.level = targetLevel;
    incident.escalation.reason = `${priority} incident unassigned for ${rounded} minutes`;
    incident.escalation.escalatedAt = now;
    incident.timeline.push({
      event: "escalated",
      message: `Incident escalated to ${targetLevel} — unassigned for ${rounded} minutes`,
      timestamp: now,
      metadata: { escalationLevel: targetLevel, ageMinutes: rounded },
    });
    await incident.save();

    const alert = await createAlert({
      type: targetLevel === "critical" ? "escalation_critical" : "escalation_warning",
      severity: targetLevel,
      title: `${targetLevel.toUpperCase()} — ${priority} Incident Not Assigned`,
      message: `${priority} incident ${incident.publicId} (${incident.type}) has not received a response after ${rounded} minutes.`,
      incidentId: incident._id,
      recipientRole: "operator",
    });
    await AnalyticsEvent.create({
      eventType: "incident_escalated",
      incidentId: incident._id,
      metadata: { level: targetLevel, priority, ageMinutes: rounded },
    }).catch(() => {});

    broadcastAlert(alert, incident);
    if (io) {
      io.emit("incident:updated", {
        publicId: incident.publicId,
        escalation: { isEscalated: true, level: targetLevel },
        updatedAt: now,
      });
    }
    count++;
    console.log(`Escalation: ${incident.publicId} → ${targetLevel}`);
  }
  return count;
}

async function flagDelayedResponses(now, priority, config) {
  if (!config.onSceneAfterMinutes) return 0;
  const threshold = new Date(now.getTime() - config.onSceneAfterMinutes * 60000);

  const incidents = await Incident.find({
    priority,
    status: { $in: WAITING_FOR_ARRIVAL_STATUSES },
    "escalation.delayAlerted": { $ne: true },
    createdAt: { $lte: threshold },
  });

  let count = 0;
  for (const incident of incidents) {
    const ageMinutes = Math.round((now - incident.createdAt) / 60000);
    incident.escalation.delayAlerted = true;
    incident.timeline.push({
      event: "response_delayed",
      message: `Responders have not reached the scene after ${ageMinutes} minutes`,
      timestamp: now,
      metadata: { ageMinutes },
    });
    await incident.save();

    const alert = await createAlert({
      type: "resource_delayed",
      severity: "warning",
      title: `Responder Delay — ${priority} Incident`,
      message: `${priority} incident ${incident.publicId} (${incident.type}) is still ${incident.status.replace("_", " ")} after ${ageMinutes} minutes.`,
      incidentId: incident._id,
      recipientRole: "operator",
    });
    broadcastAlert(alert, incident);
    count++;
  }
  return count;
}

async function checkEscalations(now = new Date()) {
  const cfg = getEscalationConfig();
  const result = { escalated: 0, delayed: 0 };
  for (const [priority, config] of Object.entries(cfg)) {
    result.escalated += await escalateUnassigned(now, priority, config);
    result.delayed += await flagDelayedResponses(now, priority, config);
  }
  return result;
}

function startEscalationCron() {
  let running = false;
  cron.schedule("* * * * *", async () => {
    if (running) return; // never overlap runs
    running = true;
    try {
      await checkEscalations();
    } catch (err) {
      console.error("Escalation cron error:", err.message);
    } finally {
      running = false;
    }
  });
  console.log("Escalation cron started");
}

module.exports = { startEscalationCron, checkEscalations, setIO, getConfig };
