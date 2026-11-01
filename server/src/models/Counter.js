const mongoose = require("mongoose");

// Atomic sequence counters used to generate human-readable public IDs (INC-10001 ...)
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // model name
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model("Counter", counterSchema);
