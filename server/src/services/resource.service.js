/**
 * Resource recommendation service.
 *
 * 1. Every available, dispatchable unit gets a suitability score:
 *      capability match 50% + availability 25% + distance 25%
 * 2. Recommendations are built per ROLE (e.g. a fire needs a fire team AND an ambulance
 *    AND police for crowd control) instead of just the top-N scores overall, so the
 *    operator sees a balanced response package. Critical incidents get a second unit of
 *    the primary type.
 * 3. Each recommendation carries a plain-language reason.
 */

const Resource = require("../models/Resource");
const { haversineMeters } = require("./duplicate.service");

const CAPABILITY_WEIGHT = 0.5;
const AVAILABILITY_WEIGHT = 0.25;
const DISTANCE_WEIGHT = 0.25;
const MAX_RECOMMEND_DISTANCE_KM = 50;
const AVG_SPEED_KMH = 40; // Demo ETA calculation speed (straight-line distance)

// Capabilities that make a unit useful for an incident type
const REQUIRED_CAPABILITIES = {
  fire: { primary: ["fire_suppression"], secondary: ["rescue", "medical", "crowd_control"] },
  flood: { primary: ["search_rescue"], secondary: ["medical", "transport"] },
  medical: { primary: ["medical"], secondary: ["trauma", "transport"] },
  accident: { primary: ["medical"], secondary: ["traffic_control", "rescue", "transport"] },
  industrial: { primary: ["hazmat", "fire_suppression"], secondary: ["medical", "search_rescue"] },
  structural: { primary: ["search_rescue", "structural_rescue"], secondary: ["rescue", "medical"] },
  other: { primary: ["security", "medical"], secondary: ["traffic_control"] },
};

// Which kinds of units make up the response package for each incident type.
// `role` first entry is the lead unit; `count` can be raised for critical incidents.
const RESPONSE_PACKAGE = {
  fire: [
    { type: "fire_team", role: "primary", why: "fire suppression" },
    { type: "ambulance", role: "support", why: "medical cover for casualties" },
    { type: "police", role: "support", why: "crowd and traffic control" },
  ],
  flood: [
    { type: "rescue", role: "primary", why: "search and rescue" },
    { type: "ambulance", role: "support", why: "medical cover" },
    { type: "police", role: "support", why: "evacuation and traffic control" },
  ],
  medical: [
    { type: "ambulance", role: "primary", why: "emergency medical care" },
  ],
  accident: [
    { type: "ambulance", role: "primary", why: "treat injured" },
    { type: "police", role: "support", why: "secure scene and control traffic" },
    { type: "rescue", role: "support", why: "extrication if people are trapped" },
  ],
  industrial: [
    { type: "fire_team", role: "primary", why: "hazmat / fire response" },
    { type: "ambulance", role: "support", why: "medical cover" },
    { type: "police", role: "support", why: "perimeter control" },
  ],
  structural: [
    { type: "rescue", role: "primary", why: "search and rescue of trapped people" },
    { type: "ambulance", role: "support", why: "medical cover" },
    { type: "fire_team", role: "support", why: "fire/gas hazard control and heavy tools" },
    { type: "police", role: "support", why: "cordon the area" },
  ],
  other: [
    { type: "police", role: "primary", why: "assess the situation" },
    { type: "ambulance", role: "support", why: "medical cover" },
  ],
};

function calculateCapabilityScore(resource, incidentType) {
  const req = REQUIRED_CAPABILITIES[incidentType] || REQUIRED_CAPABILITIES.other;
  const caps = resource.capabilities || [];

  const primaryMatch = req.primary.some((c) => caps.includes(c));
  const secondaryMatch = req.secondary.filter((c) => caps.includes(c)).length;
  const secondaryTotal = req.secondary.length || 1;

  return (primaryMatch ? 0.7 : 0) + (secondaryMatch / secondaryTotal) * 0.3;
}

function calculateDistanceScore(resourceCoords, incidentCoords) {
  const distKm = haversineMeters(resourceCoords[0], resourceCoords[1], incidentCoords[0], incidentCoords[1]) / 1000;
  if (distKm >= MAX_RECOMMEND_DISTANCE_KM) return 0;
  return 1 - distKm / MAX_RECOMMEND_DISTANCE_KM;
}

function calculateETA(resourceCoords, incidentCoords) {
  const distKm = haversineMeters(resourceCoords[0], resourceCoords[1], incidentCoords[0], incidentCoords[1]) / 1000;
  const etaMinutes = Math.round((distKm / AVG_SPEED_KMH) * 60);
  return { distanceKm: Math.round(distKm * 10) / 10, etaMinutes: Math.max(1, etaMinutes) };
}

/** Pure ranking function (no DB) — returns scored entries for the given resources. */
function scoreResources(resources, incident) {
  const incidentCoords = incident.location.coordinates;
  const incidentType = incident.type || "other";

  return resources.map((resource) => {
    const capScore = calculateCapabilityScore(resource, incidentType);
    const availScore = resource.status === "available" ? 1 : 0;
    const distScore = calculateDistanceScore(resource.location.coordinates, incidentCoords);
    const finalScore = capScore * CAPABILITY_WEIGHT + availScore * AVAILABILITY_WEIGHT + distScore * DISTANCE_WEIGHT;
    const { distanceKm, etaMinutes } = calculateETA(resource.location.coordinates, incidentCoords);

    return {
      resource,
      matchScore: Math.round(finalScore * 100),
      capabilityScore: Math.round(capScore * 100),
      distanceScore: Math.round(distScore * 100),
      distanceKm,
      etaMinutes,
    };
  });
}

/** Pure selection of the response package from scored entries. */
function selectPackage(scored, incident, maxResults = 6) {
  const type = incident.type || "other";
  const slots = RESPONSE_PACKAGE[type] || RESPONSE_PACKAGE.other;
  const chosen = [];
  const used = new Set();

  const pickBest = (resType, how) => {
    const best = scored
      .filter((s) => s.resource.type === resType && !used.has(String(s.resource._id)) && s.matchScore > 0)
      .sort((a, b) => b.matchScore - a.matchScore)[0];
    if (!best) return null;
    used.add(String(best.resource._id));
    const entry = {
      ...best,
      role: how.role,
      reason: `${how.role === "primary" ? "Lead unit" : "Support"}: ${how.why} — ${best.distanceKm} km away, ETA ~${best.etaMinutes} min`,
    };
    chosen.push(entry);
    return entry;
  };

  for (const slot of slots) pickBest(slot.type, slot);

  // Critical / high incidents get a second lead unit when one is available
  if (["critical"].includes(incident.severity) && slots.length) {
    pickBest(slots[0].type, { ...slots[0], role: "primary", why: `${slots[0].why} (second unit — critical severity)` });
  }

  return chosen.slice(0, maxResults);
}

async function getRecommendations(incident, maxResults = 6) {
  const availableResources = await Resource.find({
    status: "available",
    "availability.isAvailable": true,
    type: { $ne: "hospital" }, // hospitals are destinations, not dispatchable units
  });

  const scored = scoreResources(availableResources, incident);
  return selectPackage(scored, incident, maxResults);
}

/** Resource types the response package calls for but that the recommendation could not supply. */
function missingTypes(incident, recommendations) {
  const slots = RESPONSE_PACKAGE[incident.type || "other"] || RESPONSE_PACKAGE.other;
  const got = new Set(recommendations.map((r) => r.resource.type));
  return [...new Set(slots.map((s) => s.type))].filter((t) => !got.has(t));
}

module.exports = {
  missingTypes,
  getRecommendations,
  scoreResources,
  selectPackage,
  calculateCapabilityScore,
  calculateDistanceScore,
  calculateETA,
  haversineMeters,
  RESPONSE_PACKAGE,
};
