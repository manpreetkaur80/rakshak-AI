const mongoose = require("mongoose");

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
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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

sourceReportSchema.pre("validate", async function (next) {
  if (!this.publicId) {
    const count = await mongoose.model("SourceReport").countDocuments();
    this.publicId = `REP-${String(10001 + count).padStart(5, "0")}`;
  }
  next();
});

module.exports = mongoose.model("SourceReport", sourceReportSchema);
