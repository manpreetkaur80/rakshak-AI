const mongoose = require("mongoose");
const { publicIdPlugin } = require("../utils/publicId");

// One row per message per channel per recipient: doubles as the in-app inbox and the delivery log.
const notificationSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true, trim: true },
    channel: { type: String, enum: ["in_app", "email", "sms", "push"], required: true },
    type: { type: String, default: "system" }, // critical_incident, dispatch, escalation_critical, hospital_alert ...
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    recipientRole: { type: String, default: null },
    to: { type: String, default: null }, // email address / phone number / "in-app"
    subject: { type: String, default: "" },
    body: { type: String, default: "" },
    incidentId: { type: mongoose.Schema.Types.ObjectId, ref: "Incident", default: null },
    incidentPublicId: { type: String, default: null },
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: "Alert", default: null },
    status: { type: String, enum: ["pending", "sent", "delivered", "failed", "skipped"], default: "pending" },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    provider: { type: String, default: null }, // sendgrid | twilio | console | in_app
    providerMessageId: { type: String, default: null },
    nextAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    read: { type: Boolean, default: false },
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ publicId: 1 }, { unique: true });
notificationSchema.index({ recipientUser: 1, channel: 1, createdAt: -1 });
notificationSchema.index({ status: 1, nextAttemptAt: 1 });
notificationSchema.index({ dedupeKey: 1 });
notificationSchema.index({ createdAt: -1 });

notificationSchema.plugin(publicIdPlugin, { modelName: "Notification", prefix: "NTF" });

module.exports = mongoose.model("Notification", notificationSchema);
