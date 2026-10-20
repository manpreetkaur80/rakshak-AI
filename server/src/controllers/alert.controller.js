const Alert = require("../models/Alert");
const AnalyticsEvent = require("../models/AnalyticsEvent");

let io = null;
function setIO(socketIO) { io = socketIO; }

// GET /api/v1/alerts
const getAlerts = async (req, res, next) => {
  try {
    const { acknowledged, severity, type } = req.query;
    const filter = {};
    if (acknowledged !== undefined) filter.isAcknowledged = acknowledged === "true";
    if (severity) filter.severity = severity;
    if (type) filter.type = type;

    const alerts = await Alert.find(filter)
      .populate("incidentId", "publicId type severity priority status title")
      .populate("acknowledgedBy", "name")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/v1/alerts/:id/acknowledge
const acknowledgeAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOne({
      $or: [
        { publicId: req.params.id },
        { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null },
      ],
    });

    if (!alert) {
      return res.status(404).json({ success: false, message: "Alert not found", code: "NOT_FOUND" });
    }

    alert.isAcknowledged = true;
    alert.acknowledgedBy = req.user._id;
    alert.acknowledgedAt = new Date();
    alert.isRead = true;
    await alert.save();

    await AnalyticsEvent.create({
      eventType: "alert_acknowledged",
      incidentId: alert.incidentId,
      userId: req.user._id,
      metadata: { alertType: alert.type },
    });

    if (io) {
      io.emit("alert:updated", { id: alert._id, publicId: alert.publicId, acknowledged: true });
    }

    res.json({ success: true, data: { id: alert._id, publicId: alert.publicId, acknowledged: true } });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAlerts, acknowledgeAlert, setIO };
