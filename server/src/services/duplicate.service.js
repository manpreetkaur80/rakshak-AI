/**
 * Duplicate detection service.
 *
 * A new incident is compared with other ACTIVE incidents that are close in space and time.
 * Final score = 0.4 * location + 0.2 * time + 0.4 * text, where
 *   location : 1 at the same spot, falling off quadratically to 0 at the search radius
 *   time     : 1 when reported together, falling linearly to 0 at the time window
 *   text     : half "same incident type", half semantic overlap of the descriptions
 *              (synonym-normalised, so "flames at the bazaar" ~ "fire near the market")
 *
 * Radius, window and threshold are admin-configurable (see config.service).
 * Operators always confirm a merge — this service only proposes candidates.
 */

const Incident = require("../models/Incident");
const { getDuplicateConfig } = require("./config.service");

const LOCATION_WEIGHT = 0.4;
const TIME_WEIGHT = 0.2;
const TEXT_WEIGHT = 0.4;

// ---------------------------------------------------------------------------
// Text similarity
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  "a", "an", "the", "is", "in", "on", "at", "to", "for", "of", "and", "or", "but", "with",
  "near", "there", "has", "are", "was", "were", "have", "been", "be", "its", "it", "this",
  "that", "from", "they", "i", "he", "she", "we", "you", "my", "our", "their", "not", "no",
  "can", "see", "seen", "very", "some", "into", "just", "now", "please", "help", "area", "side",
]);

// Map synonyms / variants onto one canonical token so differently worded reports still match
const SYNONYMS = {
  blaze: "fire", ablaze: "fire", flames: "fire", flame: "fire", burning: "fire", burnt: "fire", fires: "fire",
  bazaar: "market", mandi: "market", marketplace: "market", shops: "market", shop: "market",
  smoking: "smoke", smoky: "smoke",
  trapped: "trap", stuck: "trap", stranded: "trap",
  injured: "injur", injury: "injur", injuries: "injur", hurt: "injur", wounded: "injur",
  crash: "accident", crashed: "accident", collision: "accident", collided: "accident", accidents: "accident",
  flooded: "flood", flooding: "flood", floods: "flood", waterlogged: "flood", waterlogging: "flood", submerged: "flood",
  collapsed: "collapse", collapsing: "collapse", collapses: "collapse",
  explosion: "explode", exploded: "explode", blast: "explode",
  people: "person", persons: "person", residents: "person", men: "person", women: "person", children: "person",
  building: "build", buildings: "build",
};

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
    .map((w) => SYNONYMS[w] || w);
}

function jaccardSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 && setB.size === 0) return 0.5;
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / (setA.size + setB.size - inter);
}

// Overlap coefficient: forgiving when one report is much shorter than the other
function overlapSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  return inter / Math.min(setA.size, setB.size);
}

function semanticSimilarity(a, b) {
  return Math.max(jaccardSimilarity(a, b), 0.85 * overlapSimilarity(a, b));
}

function computeTextScore(incidentA, incidentB) {
  const typeA = incidentA.type || "other";
  const typeB = incidentB.type || "other";
  let typeScore;
  if (typeA === typeB) typeScore = typeA === "other" ? 0.5 : 1;
  else if (typeA === "other" || typeB === "other") typeScore = 0.4;
  else typeScore = 0;
  const sim = semanticSimilarity(incidentA.description, incidentB.description);
  return 0.5 * typeScore + 0.5 * sim;
}

// ---------------------------------------------------------------------------
// Time similarity
// ---------------------------------------------------------------------------
function computeTimeScore(incidentCreatedAt, reportCreatedAt, windowMinutes = 10) {
  const diffMs = Math.abs(new Date(reportCreatedAt).getTime() - new Date(incidentCreatedAt).getTime());
  const diffMinutes = diffMs / 60000;
  if (diffMinutes >= windowMinutes) return 0;
  return 1 - diffMinutes / windowMinutes;
}

// ---------------------------------------------------------------------------
// Location similarity
// ---------------------------------------------------------------------------
function haversineMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeLocationScore(coordsA, coordsB, radiusMeters = 300) {
  // coords are [longitude, latitude]
  const dist = haversineMeters(coordsA[0], coordsA[1], coordsB[0], coordsB[1]);
  if (dist >= radiusMeters) return 0;
  const ratio = dist / radiusMeters;
  return 1 - ratio * ratio;
}

/** Pure scoring of two incident-like objects (used by tests and by the DB search below). */
function scorePair(a, b, { radiusMeters, timeWindowMinutes }) {
  const locationScore = computeLocationScore(a.location.coordinates, b.location.coordinates, radiusMeters);
  const timeScore = computeTimeScore(b.createdAt, a.createdAt, timeWindowMinutes);
  const textScore = computeTextScore(a, b);
  const score = locationScore * LOCATION_WEIGHT + timeScore * TIME_WEIGHT + textScore * TEXT_WEIGHT;
  return { score, locationScore, timeScore, textScore };
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Main duplicate detection
// ---------------------------------------------------------------------------
async function findDuplicateCandidates(newIncident, overrides = {}) {
  const cfg = { ...getDuplicateConfig(), ...overrides };
  const { radiusMeters, timeWindowMinutes, threshold } = cfg;

  const [lon, lat] = newIncident.location.coordinates;
  const timeWindowMs = timeWindowMinutes * 60 * 1000;
  const created = new Date(newIncident.createdAt || Date.now());
  const windowStart = new Date(created.getTime() - timeWindowMs);
  const windowEnd = new Date(created.getTime() + timeWindowMs);

  // Geospatial pre-filter in MongoDB (2dsphere index), then precise scoring here
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
  }).limit(20);

  const candidates = [];
  for (const existing of nearbyIncidents) {
    const { score, locationScore, timeScore, textScore } = scorePair(
      { ...newIncident.toObject?.() ?? newIncident, createdAt: created },
      existing,
      { radiusMeters, timeWindowMinutes }
    );

    if (score >= threshold) {
      candidates.push({
        incidentId: existing._id,
        publicId: existing.publicId,
        score: round2(score),
        locationScore: round2(locationScore),
        timeScore: round2(timeScore),
        textScore: round2(textScore),
        status: "pending",
        detectedAt: new Date(),
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

module.exports = {
  findDuplicateCandidates,
  scorePair,
  jaccardSimilarity,
  semanticSimilarity,
  computeTextScore,
  computeLocationScore,
  computeTimeScore,
  haversineMeters,
  tokenize,
};
