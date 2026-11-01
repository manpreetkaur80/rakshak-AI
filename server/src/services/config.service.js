/**
 * Runtime configuration that admins can change from the Admin panel
 * (escalation thresholds, duplicate-detection tuning).
 * Defaults come from environment variables; overrides are persisted in MongoDB.
 */
const Setting = require("../models/Setting");

const intEnv = (name, fallback) => {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function defaults() {
  return {
    escalation: {
      P1: {
        warningAfterMinutes: intEnv("ESCALATION_P1_WARNING", 2),
        criticalAfterMinutes: intEnv("ESCALATION_P1_CRITICAL", 5),
        onSceneAfterMinutes: intEnv("ESCALATION_P1_ONSCENE", 15),
      },
      P2: {
        warningAfterMinutes: intEnv("ESCALATION_P2_WARNING", 5),
        criticalAfterMinutes: intEnv("ESCALATION_P2_CRITICAL", 10),
        onSceneAfterMinutes: intEnv("ESCALATION_P2_ONSCENE", 30),
      },
    },
    autoDispatch: {
      enabled: process.env.AUTO_DISPATCH === "true",
      minPriority: "P1", // dispatch automatically for this priority and above
    },
    duplicate: {
      radiusMeters: 300,
      timeWindowMinutes: 10,
      threshold: 0.7,
    },
  };
}

let current = defaults();
const SETTING_ID = "app-config";

const clone = (o) => JSON.parse(JSON.stringify(o));

function getConfig() {
  return clone(current);
}

// Live (non-cloned) accessors for the services that run on every request / cron tick
const getEscalationConfig = () => current.escalation;
const getDuplicateConfig = () => current.duplicate;
const getAutoDispatchConfig = () => current.autoDispatch;

function validate(partial) {
  const errors = [];
  const num = (v, label, { min = 0, max = Infinity, int = false } = {}) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      errors.push(`${label} must be ${int ? "an integer" : "a number"} between ${min} and ${max}`);
      return false;
    }
    return true;
  };

  if (partial.escalation) {
    for (const [prio, cfg] of Object.entries(partial.escalation)) {
      if (!current.escalation[prio]) {
        errors.push(`Unknown priority "${prio}" (allowed: ${Object.keys(current.escalation).join(", ")})`);
        continue;
      }
      for (const [k, v] of Object.entries(cfg || {})) {
        if (!(k in current.escalation[prio])) {
          errors.push(`Unknown escalation setting "${prio}.${k}"`);
          continue;
        }
        num(v, `${prio}.${k}`, { min: 1, max: 1440 });
      }
      const merged = { ...current.escalation[prio], ...cfg };
      if (merged.criticalAfterMinutes < merged.warningAfterMinutes) {
        errors.push(`${prio}: criticalAfterMinutes must be >= warningAfterMinutes`);
      }
    }
  }
  if (partial.autoDispatch) {
    const a = partial.autoDispatch;
    for (const k of Object.keys(a)) if (!(k in current.autoDispatch)) errors.push(`Unknown autoDispatch setting "${k}"`);
    if ("enabled" in a && typeof a.enabled !== "boolean") errors.push("autoDispatch.enabled must be true or false");
    if ("minPriority" in a && !["P1", "P2", "P3"].includes(a.minPriority)) errors.push("autoDispatch.minPriority must be P1, P2 or P3");
  }
  if (partial.duplicate) {
    const d = partial.duplicate;
    for (const k of Object.keys(d)) {
      if (!(k in current.duplicate)) errors.push(`Unknown duplicate setting "${k}"`);
    }
    if ("radiusMeters" in d) num(d.radiusMeters, "radiusMeters", { min: 10, max: 5000 });
    if ("timeWindowMinutes" in d) num(d.timeWindowMinutes, "timeWindowMinutes", { min: 1, max: 240 });
    if ("threshold" in d) num(d.threshold, "threshold", { min: 0.3, max: 1 });
  }
  return errors;
}

async function update(partial) {
  const errors = validate(partial || {});
  if (errors.length) {
    const err = new Error(errors.join("; "));
    err.statusCode = 400;
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (partial.escalation) {
    for (const [prio, cfg] of Object.entries(partial.escalation)) {
      Object.assign(current.escalation[prio], cfg);
    }
  }
  if (partial.duplicate) Object.assign(current.duplicate, partial.duplicate);
  if (partial.autoDispatch) Object.assign(current.autoDispatch, partial.autoDispatch);
  await Setting.findByIdAndUpdate(SETTING_ID, { value: current }, { upsert: true });
  return getConfig();
}

async function load() {
  current = defaults();
  const saved = await Setting.findById(SETTING_ID).lean();
  if (saved && saved.value) {
    const v = saved.value;
    for (const prio of Object.keys(current.escalation)) {
      Object.assign(current.escalation[prio], (v.escalation || {})[prio] || {});
    }
    Object.assign(current.duplicate, v.duplicate || {});
    Object.assign(current.autoDispatch, v.autoDispatch || {});
  }
  return getConfig();
}

// Test helper
function reset() {
  current = defaults();
}

module.exports = { getConfig, getEscalationConfig, getDuplicateConfig, getAutoDispatchConfig, update, load, reset };
