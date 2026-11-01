/**
 * Race-free public ID generator (INC-10001, RES-10001 ...).
 *
 * The previous approach (countDocuments()+1 in a pre-validate hook) produced duplicate
 * IDs when two reports arrived at the same moment, which surfaced as HTTP 409 errors
 * and lost emergency reports. This version uses an atomic counter document per model.
 */
const mongoose = require("mongoose");
const Counter = require("../models/Counter");

function numericSuffix(publicId) {
  const m = /-(\d+)$/.exec(publicId || "");
  return m ? parseInt(m[1], 10) : 0;
}

async function nextPublicId(Model, prefix) {
  const key = Model.modelName;

  // First use: start after the highest ID that already exists (seed data uses explicit IDs),
  // so we never hand out an ID that is already taken. $setOnInsert makes concurrent inits harmless.
  const existing = await Counter.findById(key).lean();
  if (!existing) {
    const docs = await Model.find({ publicId: new RegExp(`^${prefix}-\\d+$`) })
      .select("publicId")
      .lean();
    const maxSeq = docs.reduce((max, d) => Math.max(max, numericSuffix(d.publicId) - 10000), 0);
    try {
      await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: maxSeq } }, { upsert: true });
    } catch (e) {
      if (e.code !== 11000) throw e;
    }
  }

  const c = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}-${String(10000 + c.seq).padStart(5, "0")}`;
}

/**
 * Mongoose plugin: assigns schema.publicId from the atomic counter if not set.
 * Usage: schema.plugin(publicIdPlugin, { modelName: "Incident", prefix: "INC" })
 */
function publicIdPlugin(schema, { modelName, prefix }) {
  schema.pre("validate", async function (next) {
    try {
      if (!this.publicId) {
        this.publicId = await nextPublicId(mongoose.model(modelName), prefix);
      }
      next();
    } catch (err) {
      next(err);
    }
  });
}

module.exports = { nextPublicId, publicIdPlugin };
