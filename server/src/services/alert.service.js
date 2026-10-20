const Alert = require("../models/Alert");
const AnalyticsEvent = require("../models/AnalyticsEvent");

async function createAlert({ type, severity, title, message, incidentId = null, resourceId = null, recipientRole = "operator" }) {
  const alert = await Alert.create({
    type,
    severity,
    title,
    message,
    incidentId,
    resourceId,
    recipientRole,
  });

  // Record analytics event
  try {
    await AnalyticsEvent.create({
      eventType: "alert_created",
      incidentId,
      resourceId,
      metadata: { alertType: type, severity },
    });
  } catch (e) {
    console.warn("Failed to record analytics event for alert:", e.message);
  }

  return alert;
}

async function acknowledgeAlert(alertId, userId) {
  const alert = await Alert.findByIdAndUpdate(
    alertId,
    {
      isAcknowledged: true,
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
      isRead: true,
    },
    { new: true }
  );
  return alert;
}

async function getUnacknowledgedAlerts() {
  return Alert.find({ isAcknowledged: false })
    .populate("incidentId", "publicId type severity priority status")
    .sort({ createdAt: -1 })
    .limit(50);
}

module.exports = { createAlert, acknowledgeAlert, getUnacknowledgedAlerts };
