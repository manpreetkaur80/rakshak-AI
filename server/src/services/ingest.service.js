/**
 * Multi-source ingestion: normalises the payload of each feed (emergency call, IoT sensor,
 * hospital, government department, field team) into the common report shape used by the
 * incident pipeline. Pure functions (no DB) so they are easy to test.
 */

const SENSOR_PROFILES = {
  smoke: { label: "Smoke", type: "fire", unit: "ppm", threshold: 100, phrase: "Smoke detected, possible fire" },
  temperature: { label: "Temperature", type: "fire", unit: "°C", threshold: 70, phrase: "Abnormally high temperature, possible fire" },
  flood: { label: "Water level", type: "flood", unit: "cm", threshold: 100, phrase: "Water level rising, flooding" },
  seismic: { label: "Seismic", type: "structural", unit: "magnitude", threshold: 4, phrase: "Seismic activity, possible structural damage" },
  gas: { label: "Gas", type: "industrial", unit: "ppm", threshold: 50, phrase: "Gas leak detected" },
};

const GOVT_TYPES = { flood: "flood", fire: "fire", accident: "accident", industrial: "industrial", structural: "structural" };
const COLOUR_SEVERITY = { red: "critical", orange: "high", yellow: "medium", green: "low" };
const SEVERITIES = ["low", "medium", "high", "critical"];

const SOURCES = ["sensor", "call", "hospital", "govt", "field"];
const SOURCE_TYPE_OF = { sensor: "sensor", call: "call", hospital: "hospital", govt: "govt", field: "field_team" };

class IngestError extends Error {
  constructor(message) { super(message); this.statusCode = 400; this.code = "VALIDATION_ERROR"; }
}

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Accepts {location:{coordinates:[lon,lat]}}, {location:{lat,lng}}, {lat,lng}, {latitude,longitude}. */
function parseCoords(p) {
  const loc = p.location || p;
  let lon; let lat;
  if (Array.isArray(loc.coordinates)) [lon, lat] = loc.coordinates;
  else if (loc.lat !== undefined || loc.latitude !== undefined) {
    lat = loc.lat ?? loc.latitude;
    lon = loc.lng ?? loc.lon ?? loc.longitude;
  }
  lon = Number(lon); lat = Number(lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
    throw new IngestError("A valid location is required (location.coordinates [lon, lat] or lat/lng)");
  }
  return [lon, lat];
}

function sensorSeverity(ratio) {
  if (ratio >= 3) return "critical";
  if (ratio >= 2) return "high";
  return "medium";
}

const mask = (phone) => (phone ? `****${String(phone).replace(/\D/g, "").slice(-4)}` : null);

/**
 * @returns {{ ignored?: string, description, coordinates, typeHint, address, severityHint, sourceType, sourceRef, metadata }}
 */
function normalize(source, p = {}) {
  if (!SOURCES.includes(source)) throw new IngestError(`Unknown source "${source}" (use: ${SOURCES.join(", ")})`);
  const sourceType = SOURCE_TYPE_OF[source];
  const coordinates = parseCoords(p);
  const address = str(p.address, 200);
  const eventId = str(p.eventId, 100) || null;
  const base = { coordinates, address, sourceType, severityHint: null, typeHint: "", metadata: { eventId } };

  if (source === "sensor") {
    const sensorId = str(p.sensorId, 80);
    const profile = SENSOR_PROFILES[str(p.sensorType, 30).toLowerCase()];
    if (!sensorId) throw new IngestError("sensorId is required");
    if (!profile) throw new IngestError(`sensorType must be one of: ${Object.keys(SENSOR_PROFILES).join(", ")}`);
    const value = Number(p.value);
    if (!Number.isFinite(value)) throw new IngestError("value must be a number");
    const threshold = Number.isFinite(Number(p.threshold)) && Number(p.threshold) > 0 ? Number(p.threshold) : profile.threshold;
    if (value < threshold) {
      return { ignored: `Reading ${value}${profile.unit} is below the alarm threshold ${threshold}${profile.unit}`, sensorId };
    }
    return {
      ...base, sourceRef: sensorId, typeHint: profile.type,
      severityHint: sensorSeverity(value / threshold),
      description: `${profile.phrase}. ${profile.label} sensor ${sensorId} reads ${value}${profile.unit} (alarm threshold ${threshold}${profile.unit}).`,
      metadata: { ...base.metadata, sensorId, sensorType: str(p.sensorType, 30).toLowerCase(), value, threshold, unit: profile.unit },
    };
  }

  if (source === "call") {
    const transcript = str(p.transcript, 2000);
    if (!transcript) throw new IngestError("transcript is required");
    return {
      ...base, sourceRef: str(p.callId, 80) || null,
      description: transcript,
      // Only the last 4 digits of the caller's number are stored (data minimisation)
      metadata: { ...base.metadata, callId: str(p.callId, 80) || null, callerPhone: mask(p.callerPhone), language: str(p.language, 20) || null },
    };
  }

  if (source === "hospital") {
    const name = str(p.hospitalName, 120) || str(p.hospitalId, 80) || "Hospital";
    const casualties = Number.isFinite(Number(p.incomingCasualties)) ? Math.max(0, Math.floor(Number(p.incomingCasualties))) : 0;
    const message = str(p.message, 800) || "Incoming casualties reported";
    return {
      ...base, sourceRef: str(p.hospitalId, 80) || name, typeHint: "medical",
      severityHint: casualties >= 10 ? "critical" : casualties >= 5 ? "high" : casualties >= 1 ? "medium" : null,
      description: `${name}: ${message}${casualties ? ` — ${casualties} casualties arriving, medical emergency` : ""}.`,
      metadata: { ...base.metadata, hospitalId: str(p.hospitalId, 80) || null, incomingCasualties: casualties },
    };
  }

  if (source === "govt") {
    const agency = str(p.agency, 120) || "Government department";
    const message = str(p.message, 800);
    if (!message) throw new IngestError("message is required");
    const alertType = str(p.alertType, 40).toLowerCase();
    const sev = str(p.severity, 20).toLowerCase();
    const looksLikeFlood = /flood|heavy rain|waterlog|cyclone|inundat/i.test(message);
    return {
      ...base, sourceRef: agency, typeHint: GOVT_TYPES[alertType] || (alertType === "weather" && looksLikeFlood ? "flood" : ""),
      severityHint: SEVERITIES.includes(sev) ? sev : COLOUR_SEVERITY[sev] || null,
      description: `${agency} alert (${alertType || "advisory"}): ${message}`,
      metadata: { ...base.metadata, agency, alertType: alertType || null },
    };
  }

  // field team
  const message = str(p.message, 1000);
  if (!message) throw new IngestError("message is required");
  const sev = str(p.severity, 20).toLowerCase();
  return {
    ...base, sourceRef: str(p.unitId, 80) || str(p.responderName, 80) || null, typeHint: str(p.type, 20).toLowerCase(),
    severityHint: SEVERITIES.includes(sev) ? sev : null,
    description: `Field team update${p.unitId ? ` (${str(p.unitId, 80)})` : ""}: ${message}`,
    metadata: { ...base.metadata, unitId: str(p.unitId, 80) || null, responderName: str(p.responderName, 80) || null },
  };
}

// ── sample payloads for the admin simulator (Ahmedabad market area) ──────────
const MARKET = [72.5714, 23.0225];
const jitter = (v, m = 0.0015) => v + (Math.random() - 0.5) * 2 * m;
const nearPoint = (near) => {
  const [lon, lat] = near && Number.isFinite(near.lng) && Number.isFinite(near.lat) ? [near.lng, near.lat] : MARKET;
  return { lat: jitter(lat), lng: jitter(lon) };
};

function samplePayload(source, near) {
  const loc = nearPoint(near);
  switch (source) {
    case "sensor":
      return { sensorId: `SMK-${100 + Math.floor(Math.random() * 20)}`, sensorType: "smoke", value: 320, location: loc, address: "Central Market (smoke sensor)" };
    case "call":
      return { callId: `CALL-${Date.now() % 100000}`, callerPhone: "+919812345678", transcript: "Help! There is a big fire at the market, shops are burning and people are running out. Please send fire brigade.", location: loc, address: "Central Market" };
    case "hospital":
      return { hospitalId: "HOS-01", hospitalName: "Demo General Hospital", message: "Ambulances report burn victims from the market area", incomingCasualties: 6, location: loc, address: "Central Market" };
    case "govt":
      return { agency: "District Disaster Management", alertType: "weather", severity: "orange", message: "Heavy rain and waterlogging expected in low-lying areas near the river, flooding possible", location: loc, address: "Riverfront area" };
    case "field":
      return { unitId: "FT-01", responderName: "Arjun", message: "Fire spreading to adjacent shops, need additional ambulance", severity: "high", type: "fire", location: loc, address: "Central Market" };
    default:
      throw new IngestError(`Unknown source "${source}"`);
  }
}

module.exports = { normalize, samplePayload, parseCoords, IngestError, SOURCES, SENSOR_PROFILES };
