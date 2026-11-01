const mongoose = require("mongoose");
const { publicIdPlugin } = require("../utils/publicId");

const analyticsEventSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    eventType: {
      type: String,
      enum: [
        "incident_created",
        "incident_classified",
        "incident_assigned",
        "incident_escalated",
        "incident_resolved",
        "incident_closed",
        "incident_merged",
        "duplicate_detected",
        "duplicate_confirmed",
        "duplicate_rejected",
        "resource_assigned",
        "resource_status_changed",
        "ai_classification_success",
        "ai_classification_fallback",
        "ai_classification_failed",
        "operator_ai_override",
        "alert_created",
        "alert_acknowledged",
        "resource_shortage",
        "false_report_dismissed",
        "auto_dispatch",
        "dispatch_recalled",
        "notification_failed",
      ],
      required: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ eventType: 1 });
analyticsEventSchema.index({ incidentId: 1 });
analyticsEventSchema.index({ timestamp: -1 });
analyticsEventSchema.index({ publicId: 1 }, { unique: true });


analyticsEventSchema.plugin(publicIdPlugin, { modelName: "AnalyticsEvent", prefix: "EVT" });

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
