const test = require("node:test");
const assert = require("node:assert");
const { normalize, parseCoords, IngestError } = require("../../src/services/ingest.service");

const loc = { lat: 23.02, lng: 72.57 };

test("coordinates accept several shapes and reject junk", () => {
  assert.deepStrictEqual(parseCoords({ location: { coordinates: [72.5, 23] } }), [72.5, 23]);
  assert.deepStrictEqual(parseCoords({ location: { lat: 23, lng: 72.5 } }), [72.5, 23]);
  assert.deepStrictEqual(parseCoords({ latitude: 23, longitude: 72.5 }), [72.5, 23]);
  assert.throws(() => parseCoords({ location: { lat: 200, lng: 0 } }), IngestError);
  assert.throws(() => parseCoords({}), IngestError);
});

test("sensor severity scales with how far over the threshold the reading is", () => {
  const sev = (v) => normalize("sensor", { sensorId: "s", sensorType: "smoke", value: v, location: loc }).severityHint;
  assert.strictEqual(sev(110), "medium");
  assert.strictEqual(sev(250), "high");
  assert.strictEqual(sev(400), "critical");
  assert.ok(normalize("sensor", { sensorId: "s", sensorType: "smoke", value: 50, location: loc }).ignored);
});

test("seismic and flood sensors map to the right incident type", () => {
  assert.strictEqual(normalize("sensor", { sensorId: "s", sensorType: "seismic", value: 5, location: loc }).typeHint, "structural");
  assert.strictEqual(normalize("sensor", { sensorId: "s", sensorType: "flood", value: 150, location: loc }).typeHint, "flood");
});

test("hospital casualties drive severity; govt colour codes map to severities", () => {
  assert.strictEqual(normalize("hospital", { incomingCasualties: 3, location: loc }).severityHint, "medium");
  assert.strictEqual(normalize("hospital", { incomingCasualties: 7, location: loc }).severityHint, "high");
  assert.strictEqual(normalize("govt", { agency: "IMD", severity: "orange", message: "x", location: loc }).severityHint, "high");
});

test("phone numbers are masked and oversized text is truncated", () => {
  const n = normalize("call", { callerPhone: "+919812345678", transcript: "x".repeat(5000), location: loc });
  assert.strictEqual(n.metadata.callerPhone, "****5678");
  assert.strictEqual(n.description.length, 2000);
});
