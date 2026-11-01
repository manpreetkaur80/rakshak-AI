const mongoose = require("mongoose");
const { publicIdPlugin } = require("../utils/publicId");

const sourceReportSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },
    // null for anonymous reports (citizens are not required to sign up to report an emergency)
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Which feed this report came from, and the feed's own reference (sensor ID, call ID, hospital ID ...)
    sourceType: {
      type: String,
      enum: ["web", "call", "sensor", "hospital", "govt", "field_team"],
      default: "web",
    },
    sourceRef: { type: String, default: null },
    reporterType: {
      type: String,
      enum: ["anonymous", "citizen", "staff"],
      default: "anonymous",
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description too long"],
    },
    typeHint: {
      type: String,
      enum: ["fire", "flood", "medical", "accident", "industrial", "structural", "other", ""],
      default: "",
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    address: {
      type: String,
      default: "",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

sourceReportSchema.index({ location: "2dsphere" });
sourceReportSchema.index({ publicId: 1 }, { unique: true });
sourceReportSchema.index({ incidentId: 1 });
sourceReportSchema.index({ createdAt: -1 });
sourceReportSchema.index({ reportedBy: 1 });
sourceReportSchema.index({ sourceType: 1, createdAt: -1 });
sourceReportSchema.index({ sourceType: 1, sourceRef: 1 });


sourceReportSchema.plugin(publicIdPlugin, { modelName: "SourceReport", prefix: "REP" });

module.exports = mongoose.model("SourceReport", sourceReportSchema);
