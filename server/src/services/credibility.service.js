/**
 * Fake / prank report screening.
 * Produces a credibility score 0..1 (1 = very likely genuine) with human-readable flags.
 * It never blocks a report – it only informs operators and stops low-credibility
 * reports from raising P1 alarms or being auto-dispatched.
 */
const SourceReport = require("../models/SourceReport");

// Feeds from machines / staff are trusted by default
const TRUSTED = { sensor: 0.9, hospital: 0.9, govt: 0.95, field_team: 0.85, call: 0.7 };

const JUNK = /^(test|testing|hello|hi|hey|asdf+|qwerty|abc+|xxx+|lol|hahaha*|prank|joke|demo)\b/i;
const PRANK = /\b(prank|just kidding|joking|for fun|lol|haha|test(ing)? (report|message))\b/i;

const LEVELS = (s) => (s >= 0.6 ? "high" : s >= 0.35 ? "medium" : "low");

/**
 * @param {object} r  { description, sourceType, user, coordinates, hasImage, typeHint }
 */
async function assess(r) {
  const text = String(r.description || "").trim();
  const flags = [];
  let score = TRUSTED[r.sourceType] ?? 0.65;

  if (!TRUSTED[r.sourceType]) {
    if (r.user) score += 0.1; // signed-in citizen: accountable
    else { score -= 0.05; }
    if (r.hasImage) { score += 0.1; }
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (text.length < 15 || words.length < 3) { score -= 0.3; flags.push("Very short description"); }
  if (JUNK.test(text) || PRANK.test(text)) { score -= 0.45; flags.push("Looks like a test or prank message"); }
  if (/(.)\1{5,}/.test(text)) { score -= 0.3; flags.push("Repeated characters"); }
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length > 8 && !/[aeiou]/i.test(letters)) { score -= 0.3; flags.push("Gibberish text"); }
  if (text.length > 15 && text === text.toUpperCase() && /[A-Z]{15,}/.test(text)) { score -= 0.1; flags.push("All caps"); }
  if (text.length > 20 && new Set(words.map((w) => w.toLowerCase())).size <= Math.ceil(words.length / 4)) {
    score -= 0.2; flags.push("Repetitive wording");
  }

  // Flooding: many recent reports from the same account or the same exact spot
  if (!TRUSTED[r.sourceType]) {
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const q = r.user
      ? { reportedBy: r.user._id, createdAt: { $gte: since } }
      : r.coordinates
        ? { reporterType: "anonymous", sourceType: "web", createdAt: { $gte: since }, "location.coordinates": r.coordinates }
        : null;
    if (q) {
      const n = await SourceReport.countDocuments(q);
      if (n >= 3) { score -= 0.25; flags.push(`${n} reports from the same ${r.user ? "account" : "spot"} in 15 minutes`); }
    }
  }

  score = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return { score, level: LEVELS(score), flags, assessedAt: new Date() };
}

/** Independent corroboration (another report/source about the same event) raises credibility. */
function corroborate(credibility, sourceTypes) {
  if (!credibility) return credibility;
  const distinct = new Set(sourceTypes).size;
  const bonus = Math.min(0.4, 0.15 * (distinct - 1) + 0.05 * (sourceTypes.length - distinct));
  if (bonus <= 0) return credibility;
  const score = Math.min(1, Math.round((credibility.score + bonus) * 100) / 100);
  const flags = credibility.flags.filter((f) => !f.startsWith("Corroborated"));
  flags.push(`Corroborated by ${sourceTypes.length} reports from ${distinct} source${distinct > 1 ? "s" : ""}`);
  return { ...credibility, score, level: LEVELS(score), flags };
}

module.exports = { assess, corroborate, LEVELS };
