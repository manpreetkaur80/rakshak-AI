const test = require("node:test");
const assert = require("node:assert");
const d = require("../../src/services/duplicate.service");

const cfg = { radiusMeters: 300, timeWindowMinutes: 10 };
const THRESHOLD = 0.7;
const now = Date.now();
const mk = (type, description, dLon, minAgo) => ({
  type,
  description,
  location: { coordinates: [72.5714 + dLon, 23.0225] },
  createdAt: new Date(now - minAgo * 60000),
});
const base = mk("fire", "Large fire near Central Market, heavy smoke, people trapped", 0, 0);

test("same fire, reworded, 150 m / 1 min apart is a duplicate", () => {
  const r = d.scorePair(mk("fire", "Flames and smoke at the bazaar, people stuck inside", 0.0013, 1), base, cfg);
  assert.ok(r.score >= THRESHOLD, `score ${r.score}`);
});

test("short report 100 m away is a duplicate", () => {
  assert.ok(d.scorePair(mk("fire", "Market on fire", 0.0009, 2), base, cfg).score >= THRESHOLD);
});

test("different incident type at same spot is NOT a duplicate", () => {
  assert.ok(d.scorePair(mk("flood", "Water flooding near the market, vehicles stranded", 0, 1), base, cfg).score < THRESHOLD);
});

test("distant + old fire is NOT a duplicate", () => {
  assert.ok(d.scorePair(mk("fire", "Fire in a warehouse", 0.0025, 9), base, cfg).score < THRESHOLD);
});

test("outside radius scores zero for location", () => {
  assert.strictEqual(d.computeLocationScore([72.5714, 23.0225], [72.58, 23.0225], 300), 0);
});

test("synonyms are normalised", () => {
  assert.deepStrictEqual(d.tokenize("blaze at the bazaar"), ["fire", "market"]);
});
