const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        "new_incident",
        "critical_incident",
        "duplicate_candidate",
        "resource_assigned",
        "resource_delayed",
        "escalation_warning",
        "escalation_critical",
        "incident_resolved",
        "system",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
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
    recipientRole: {
      type: String,
      enum: ["operator", "admin", "responder", "all"],
      default: "operator",
    },
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isAcknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

alertSchema.index({ publicId: 1 }, { unique: true });
alertSchema.index({ incidentId: 1 });
alertSchema.index({ isAcknowledged: 1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ recipientUser: 1 });

alertSchema.pre("validate", async function (next) {
  if (!this.publicId) {
    const count = await mongoose.model("Alert").countDocuments();
    this.publicId = `ALT-${String(10001 + count).padStart(5, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Alert", alertSchema);
