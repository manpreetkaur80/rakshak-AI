/**
 * Duplicate detection service
 * Weights: location 40%, time 20%, text 40%
 * Default radius: 300m, time window: 10 min, threshold: 0.75
 */

const Incident = require("../models/Incident");

const LOCATION_WEIGHT = 0.4;
const TIME_WEIGHT = 0.2;
const TEXT_WEIGHT = 0.4;
const DEFAULT_RADIUS_METERS = 300;
const DEFAULT_TIME_WINDOW_MINUTES = 10;
const DUPLICATE_THRESHOLD = 0.75;

// ---------------------------------------------------------------------------
// Text similarity (Jaccard on word tokens)
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "a","an","the","is","in","on","at","to","for","of","and","or","but","with",
  "near","there","has","are","was","were","have","been","be","its","it","this",
  "that","from","they","i","he","she","we","you","my","our","their","not","no",
]);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 0.5;

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return intersection.size / union.size;
}

// ---------------------------------------------------------------------------
// Time similarity
// ---------------------------------------------------------------------------
function computeTimeScore(incidentCreatedAt, reportCreatedAt, windowMinutes = DEFAULT_TIME_WINDOW_MINUTES) {
  const diffMs = Math.abs(
    new Date(reportCreatedAt).getTime() - new Date(incidentCreatedAt).getTime()
  );
  const diffMinutes = diffMs / 60000;
  if (diffMinutes >= windowMinutes) return 0;
  return 1 - diffMinutes / windowMinutes;
}

// ---------------------------------------------------------------------------
// Location similarity
// ---------------------------------------------------------------------------
function haversineMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function computeLocationScore(coordsA, coordsB, radiusMeters = DEFAULT_RADIUS_METERS) {
  // coordsA/B are [longitude, latitude]
  const dist = haversineMeters(coordsA[0], coordsA[1], coordsB[0], coordsB[1]);
  if (dist >= radiusMeters) return 0;
  return 1 - dist / radiusMeters;
}

// ---------------------------------------------------------------------------
// Main duplicate detection
// ---------------------------------------------------------------------------
async function findDuplicateCandidates(
  newIncident,
  {
    radiusMeters = DEFAULT_RADIUS_METERS,
    timeWindowMinutes = DEFAULT_TIME_WINDOW_MINUTES,
    threshold = DUPLICATE_THRESHOLD,
  } = {}
) {
  const [lon, lat] = newIncident.location.coordinates;
  const timeWindowMs = timeWindowMinutes * 60 * 1000;
  const windowStart = new Date(newIncident.createdAt.getTime() - timeWindowMs);
  const windowEnd = new Date(newIncident.createdAt.getTime() + timeWindowMs);

  // Find nearby incidents using MongoDB geospatial query
  const nearbyIncidents = await Incident.find({
    _id: { $ne: newIncident._id },
    status: { $nin: ["RESOLVED", "CLOSED", "MERGED"] },
    createdAt: { $gte: windowStart, $lte: windowEnd },
    location: {
      $near: {
        $geometry: { type: "Point", coordinates: [lon, lat] },
        $maxDistance: radiusMeters,
      },
    },
  }).limit(10);

  const candidates = [];

  for (const existing of nearbyIncidents) {
    const locationScore = computeLocationScore(
      newIncident.location.coordinates,
      existing.location.coordinates,
      radiusMeters
    );

    const timeScore = computeTimeScore(
      existing.createdAt,
      newIncident.createdAt,
      timeWindowMinutes
    );

    const textScore = jaccardSimilarity(
      newIncident.description,
      existing.description
    );

    const score =
      locationScore * LOCATION_WEIGHT +
      timeScore * TIME_WEIGHT +
      textScore * TEXT_WEIGHT;

    if (score >= threshold) {
      candidates.push({
        incidentId: existing._id,
        publicId: existing.publicId,
        score: Math.round(score * 100) / 100,
        locationScore: Math.round(locationScore * 100) / 100,
        timeScore: Math.round(timeScore * 100) / 100,
        textScore: Math.round(textScore * 100) / 100,
        status: "pending",
        detectedAt: new Date(),
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

module.exports = {
  findDuplicateCandidates,
  jaccardSimilarity,
  computeLocationScore,
  computeTimeScore,
  haversineMeters,
  DUPLICATE_THRESHOLD,
};
