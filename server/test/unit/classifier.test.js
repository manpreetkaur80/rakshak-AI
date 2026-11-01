const test = require("node:test");
const assert = require("node:assert");
const { ruleBasedClassify, validateAIOutput, templateSummary } = require("../../src/services/ai.service");

const cases = [
  ["Large fire near central market, people trapped inside", "fire", "critical", "P1"],
  ["Building collapsed on Station road, people trapped", "structural", "critical", "P1"],
  ["An old man collapsed and is not breathing", "medical", "critical", "P1"],
  ["Water level rising, colony flooded, vehicles stranded", "flood", "high", "P2"],
  ["Two cars collided on the highway, one person bleeding", "accident", "high", "P2"],
  ["Gas leak at the chemical factory", "industrial", "critical", "P1"],
  ["Small fire in a dustbin, under control", "fire", "low", "P4"],
];

for (const [text, type, severity, priority] of cases) {
  test(`classifies: ${text}`, () => {
    const r = ruleBasedClassify(text);
    assert.strictEqual(r.type, type);
    assert.strictEqual(r.severity, severity);
    assert.strictEqual(r.priority, priority);
    assert.ok(validateAIOutput(r));
  });
}

test("does not match keywords inside other words (fireworks)", () => {
  assert.strictEqual(ruleBasedClassify("Fireworks shop opened").type, "other");
});

test("falls back to the citizen-selected category when text has no signal", () => {
  const r = ruleBasedClassify("Help needed near the station", "flood");
  assert.strictEqual(r.type, "flood");
  assert.ok(r.confidence <= 0.5);
});

test("template summary mentions report count and units", () => {
  const s = templateSummary({ type: "fire", severity: "critical", priority: "P1", status: "ASSIGNED", address: "Market" }, [{ description: "a" }, { description: "b" }], [{ publicId: "FT-01" }]);
  assert.match(s, /2 corroborating reports/);
  assert.match(s, /FT-01/);
});
