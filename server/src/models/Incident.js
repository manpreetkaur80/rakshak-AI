const mongoose = require("mongoose");

const timelineEventSchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    performedBy: {
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
  { _id: true }
);

const aiClassificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["fire", "flood", "medical", "accident", "industrial", "structural", "other"],
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
    },
    priority: {
      type: String,
      enum: ["P1", "P2", "P3", "P4"],
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
    },
    summary: { type: String, default: "" },
    recommendedActions: { type: [String], default: [] },
    provider: {
      type: String,
      enum: ["gemini", "rules", "manual"],
      default: "rules",
    },
    isFallback: { type: Boolean, default: false },
    classifiedAt: { type: Date, default: null },
  },
  { _id: false }
);

const duplicateCandidateSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
    },
    score: { type: Number, min: 0, max: 1 },
    locationScore: { type: Number, min: 0, max: 1 },
    timeScore: { type: Number, min: 0, max: 1 },
    textScore: { type: Number, min: 0, max: 1 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "rejected"],
      default: "pending",
    },
    detectedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const assignedResourceSchema = new mongoose.Schema(
  {
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
    },
    assignedAt: { type: Date, default: Date.now },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["assigned", "accepted", "en_route", "on_scene", "completed", "cancelled"],
      default: "assigned",
    },
  },
  { _id: true }
);

const incidentSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["fire", "flood", "medical", "accident", "industrial", "structural", "other"],
      default: "other",
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    priority: {
      type: String,
      enum: ["P1", "P2", "P3", "P4"],
      default: "P3",
    },
    status: {
      type: String,
      enum: [
        "REPORTED",
        "CLASSIFIED",
        "ASSIGNED",
        "EN_ROUTE",
        "ON_SCENE",
        "RESOLVED",
        "CLOSED",
        "DUPLICATE_CANDIDATE",
        "MERGED",
      ],
      default: "REPORTED",
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
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
    landmark: {
      type: String,
      default: "",
    },
    imageUrl: {
      type: String,
      default: null,
    },
    sourceReports: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SourceReport",
      },
    ],
    aiClassification: {
      type: aiClassificationSchema,
      default: null,
    },
    duplicateCandidates: {
      type: [duplicateCandidateSchema],
      default: [],
    },
    assignedResources: {
      type: [assignedResourceSchema],
      default: [],
    },
    assignedResponder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    timeline: {
      type: [timelineEventSchema],
      default: [],
    },
    escalation: {
      isEscalated: { type: Boolean, default: false },
      level: {
        type: String,
        enum: ["warning", "critical", null],
        default: null,
      },
      reason: { type: String, default: null },
      escalatedAt: { type: Date, default: null },
      escalatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
    },
    resolution: {
      resolvedAt: { type: Date, default: null },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
      },
      resolutionNote: { type: String, default: null },
    },
    isDemo: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Geospatial and query indexes
incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ publicId: 1 }, { unique: true });
incidentSchema.index({ status: 1 });
incidentSchema.index({ severity: 1 });
incidentSchema.index({ priority: 1 });
incidentSchema.index({ type: 1 });
incidentSchema.index({ createdAt: -1 });
incidentSchema.index({ status: 1, createdAt: -1 });

// Auto-generate publicId
incidentSchema.pre("validate", async function (next) {
  if (!this.publicId) {
    const count = await mongoose.model("Incident").countDocuments();
    this.publicId = `INC-${String(10001 + count).padStart(5, "0")}`;
  }
  next();
});

module.exports = mongoose.model("Incident", incidentSchema);
