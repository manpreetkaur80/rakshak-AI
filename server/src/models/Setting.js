const mongoose = require("mongoose");

// Simple key/value store for admin-editable runtime configuration (escalation thresholds etc.)
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Setting", settingSchema);
