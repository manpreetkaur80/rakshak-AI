const mongoose = require("mongoose");
const { publicIdPlugin } = require("../utils/publicId");

const resourceSchema = new mongoose.Schema(
  {
    publicId: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: [true, "Resource name is required"],
      trim: true,
    },
    type: {
      type: String,
      enum: ["fire_team", "ambulance", "police", "rescue", "hospital"],
      required: [true, "Resource type is required"],
    },
    capabilities: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["available", "assigned", "en_route", "on_scene", "unavailable", "maintenance"],
      default: "available",
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
    baseLocation: {
      type: {
        type: String,
        enum: ["Point"],
      },
      coordinates: {
        type: [Number],
      },
    },
    contact: {
      phone: { type: String, default: null },
      radioChannel: { type: String, default: null },
    },
    // The responder user who operates this unit; used to show assigned incidents to that responder
    responderUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    currentIncident: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Incident",
      default: null,
    },
    availability: {
      isAvailable: { type: Boolean, default: true },
      lastUpdated: { type: Date, default: Date.now },
    },
    capacity: {
      personnel: { type: Number, default: 0 },
      patients: { type: Number, default: 0 },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

resourceSchema.index({ location: "2dsphere" });
resourceSchema.index({ publicId: 1 }, { unique: true });
resourceSchema.index({ type: 1 });
resourceSchema.index({ responderUser: 1 });
resourceSchema.index({ status: 1 });
resourceSchema.index({ type: 1, status: 1 });


resourceSchema.plugin(publicIdPlugin, { modelName: "Resource", prefix: "RES" });

module.exports = mongoose.model("Resource", resourceSchema);
