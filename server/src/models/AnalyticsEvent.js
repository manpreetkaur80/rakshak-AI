const mongoose = require("mongoose");

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

analyticsEventSchema.pre("validate", async function (next) {
  if (!this.publicId) {
    const count = await mongoose.model("AnalyticsEvent").countDocuments();
    this.publicId = `EVT-${String(10001 + count).padStart(5, "0")}`;
  }
  next();
});

module.exports = mongoose.model("AnalyticsEvent", analyticsEventSchema);
