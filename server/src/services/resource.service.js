/**
 * Resource recommendation service
 * Weights: capability 50%, availability 25%, distance 25%
 */

const Resource = require("../models/Resource");
const { haversineMeters } = require("./duplicate.service");

const CAPABILITY_WEIGHT = 0.5;
const AVAILABILITY_WEIGHT = 0.25;
const DISTANCE_WEIGHT = 0.25;
const MAX_RECOMMEND_DISTANCE_KM = 50;
const AVG_SPEED_KMH = 40; // Demo ETA calculation speed

// Capability requirements by incident type and severity
const REQUIRED_CAPABILITIES = {
  fire: {
    primary: ["fire_suppression"],
    secondary: ["rescue", "medical", "crowd_control"],
  },
  flood: {
    primary: ["search_rescue"],
    secondary: ["medical", "transport"],
  },
  medical: {
    primary: ["medical"],
    secondary: ["trauma", "transport"],
  },
  accident: {
    primary: ["medical"],
    secondary: ["traffic_control", "rescue", "transport"],
  },
  industrial: {
    primary: ["fire_suppression"],
    secondary: ["medical", "hazmat", "search_rescue"],
  },
  structural: {
    primary: ["search_rescue"],
    secondary: ["rescue", "medical", "structural_rescue"],
  },
  other: {
    primary: ["medical"],
    secondary: ["security"],
  },
};

function calculateCapabilityScore(resource, incidentType) {
  const req = REQUIRED_CAPABILITIES[incidentType] || REQUIRED_CAPABILITIES.other;
  const caps = resource.capabilities || [];

  const primaryMatch = req.primary.some((c) => caps.includes(c));
  const secondaryMatch = req.secondary.filter((c) => caps.includes(c)).length;
  const secondaryTotal = req.secondary.length || 1;

  const primaryScore = primaryMatch ? 0.7 : 0;
  const secondaryScore = (secondaryMatch / secondaryTotal) * 0.3;
  return primaryScore + secondaryScore;
}

function calculateDistanceScore(resourceCoords, incidentCoords) {
  const distMeters = haversineMeters(
    resourceCoords[0],
    resourceCoords[1],
    incidentCoords[0],
    incidentCoords[1]
  );
  const distKm = distMeters / 1000;
  if (distKm >= MAX_RECOMMEND_DISTANCE_KM) return 0;
  return 1 - distKm / MAX_RECOMMEND_DISTANCE_KM;
}

function calculateETA(resourceCoords, incidentCoords) {
  const distMeters = haversineMeters(
    resourceCoords[0],
    resourceCoords[1],
    incidentCoords[0],
    incidentCoords[1]
  );
  const distKm = distMeters / 1000;
  const etaMinutes = Math.round((distKm / AVG_SPEED_KMH) * 60);
  return { distanceKm: Math.round(distKm * 10) / 10, etaMinutes: Math.max(1, etaMinutes) };
}

async function getRecommendations(incident, topN = 3) {
  const incidentCoords = incident.location.coordinates;
  const incidentType = incident.type || "other";

  // Find available resources
  const availableResources = await Resource.find({
    status: "available",
    "availability.isAvailable": true,
  });

  const scored = availableResources.map((resource) => {
    const capScore = calculateCapabilityScore(resource, incidentType);
    const availScore = resource.status === "available" ? 1.0 : 0.0;
    const distScore = calculateDistanceScore(
      resource.location.coordinates,
      incidentCoords
    );

    const finalScore =
      capScore * CAPABILITY_WEIGHT +
      availScore * AVAILABILITY_WEIGHT +
      distScore * DISTANCE_WEIGHT;

    const { distanceKm, etaMinutes } = calculateETA(
      resource.location.coordinates,
      incidentCoords
    );

    return {
      resource,
      matchScore: Math.round(finalScore * 100),
      capabilityScore: Math.round(capScore * 100),
      distanceScore: Math.round(distScore * 100),
      distanceKm,
      etaMinutes,
    };
  });

  // Sort by score, return top N
  return scored
    .filter((s) => s.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, topN);
}

module.exports = { getRecommendations, calculateETA, haversineMeters };
