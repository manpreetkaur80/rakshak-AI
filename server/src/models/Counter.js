const mongoose = require("mongoose");

// Atomic sequence counters used to generate human-readable public IDs (INC-10001 ...)
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // model name
  seq: { type: Number, default: 0 },
});

// Dedicated collection name: a generic "counters" collection may already exist in a database created by an
// older version of the project, with its own (conflicting) unique index on "key".
module.exports = mongoose.model("Counter", counterSchema, "publicid_sequences");