const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    severity: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      required: true,
    },

    priority: {
      type: String,
      enum: ["P1", "P2", "P3", "P4"],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "Reported",
        "Dispatched",
        "Responding",
        "Resolved",
      ],
      default: "Reported",
    },

    reportedBy: {
      type: String,
      default: "Anonymous",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Incident", incidentSchema);