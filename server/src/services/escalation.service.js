/**
 * Escalation service — checks P1/P2 incidents for delayed response
 * and creates alerts via cron
 */

const cron = require("node-cron");
const Incident = require("../models/Incident");
const { createAlert } = require("./alert.service");
let io = null;

const ESCALATION_CONFIG = {
  P1: {
    warningAfterMinutes: parseInt(process.env.ESCALATION_P1_WARNING) || 2,
    criticalAfterMinutes: parseInt(process.env.ESCALATION_P1_CRITICAL) || 5,
  },
  P2: {
    warningAfterMinutes: parseInt(process.env.ESCALATION_P2_WARNING) || 5,
    criticalAfterMinutes: parseInt(process.env.ESCALATION_P2_CRITICAL) || 10,
  },
};

function setIO(socketIO) {
  io = socketIO;
}

function getConfig() {
  return ESCALATION_CONFIG;
}

function updateConfig(newConfig) {
  Object.assign(ESCALATION_CONFIG, newConfig);
}

async function checkEscalations() {
  const now = new Date();

  for (const [priority, config] of Object.entries(ESCALATION_CONFIG)) {
    const warningThreshold = new Date(now.getTime() - config.warningAfterMinutes * 60000);
    const criticalThreshold = new Date(now.getTime() - config.criticalAfterMinutes * 60000);

    // Find unassigned incidents past warning threshold
    const unassignedIncidents = await Incident.find({
      priority,
      status: { $in: ["REPORTED", "CLASSIFIED"] },
      "escalation.isEscalated": false,
      createdAt: { $lte: warningThreshold },
    }).populate("createdBy", "name");

    for (const incident of unassignedIncidents) {
      const ageMinutes = (now - incident.createdAt) / 60000;
      let escalationLevel = null;
      let alertSeverity = null;
      let alertType = null;

      if (ageMinutes >= config.criticalAfterMinutes) {
        escalationLevel = "critical";
        alertSeverity = "critical";
        alertType = "escalation_critical";
      } else if (ageMinutes >= config.warningAfterMinutes) {
        escalationLevel = "warning";
        alertSeverity = "warning";
        alertType = "escalation_warning";
      }

      if (!escalationLevel) continue;

      // Update incident escalation
      await Incident.findByIdAndUpdate(incident._id, {
        "escalation.isEscalated": true,
        "escalation.level": escalationLevel,
        "escalation.reason": `${priority} incident unassigned for ${Math.round(ageMinutes)} minutes`,
        "escalation.escalatedAt": now,
        $push: {
          timeline: {
            event: "escalated",
            message: `Incident escalated to ${escalationLevel} — unassigned for ${Math.round(ageMinutes)} minutes`,
            timestamp: now,
            metadata: { escalationLevel, ageMinutes: Math.round(ageMinutes) },
          },
        },
      });

      // Create alert
      const alert = await createAlert({
        type: alertType,
        severity: alertSeverity,
        title: `${escalationLevel.toUpperCase()} — ${priority} Incident Not Assigned`,
        message: `${priority} incident ${incident.publicId} (${incident.type}) has not received a response after ${Math.round(ageMinutes)} minutes.`,
        incidentId: incident._id,
        recipientRole: "operator",
      });

      // Emit socket event
      if (io) {
        io.emit("alert:created", {
          id: alert._id,
          publicId: alert.publicId,
          type: alertType,
          severity: alertSeverity,
          title: alert.title,
          message: alert.message,
          incidentId: incident.publicId,
          acknowledged: false,
        });
        io.emit("incident:updated", {
          publicId: incident.publicId,
          escalation: { isEscalated: true, level: escalationLevel },
          updatedAt: now,
        });
      }

      console.log(`Escalation: ${incident.publicId} → ${escalationLevel}`);
    }
  }
}

function startEscalationCron() {
  // Run every minute
  cron.schedule("* * * * *", async () => {
    try {
      await checkEscalations();
    } catch (err) {
      console.error("Escalation cron error:", err.message);
    }
  });
  console.log("Escalation cron started");
}

module.exports = { startEscalationCron, checkEscalations, setIO, getConfig, updateConfig };
