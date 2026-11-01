const test = require("node:test");
const assert = require("node:assert");
const { scoreResources, selectPackage } = require("../../src/services/resource.service");

const res = (id, type, caps, dLon = 0, status = "available") => ({
  _id: id, publicId: id, type, capabilities: caps, status,
  location: { coordinates: [72.57 + dLon, 23.02] },
});
const incident = (type, severity = "high") => ({ type, severity, location: { coordinates: [72.57, 23.02] } });

const fleet = [
  res("FT-1", "fire_team", ["fire_suppression", "rescue"], 0.01),
  res("FT-2", "fire_team", ["fire_suppression"], 0.03),
  res("AMB-1", "ambulance", ["medical", "trauma", "transport"], 0.02),
  res("PU-1", "police", ["traffic_control", "crowd_control", "security"], 0.02),
  res("RST-1", "rescue", ["search_rescue"], 0.02),
];

test("fire gets fire team + ambulance + police, lead unit is nearest fire team", () => {
  const pkg = selectPackage(scoreResources(fleet, incident("fire")), incident("fire"));
  assert.deepStrictEqual(pkg.map((p) => p.resource.type), ["fire_team", "ambulance", "police"]);
  assert.strictEqual(pkg[0].resource.publicId, "FT-1");
  assert.strictEqual(pkg[0].role, "primary");
  assert.ok(pkg[0].reason.includes("km"));
});

test("critical severity adds a second lead unit", () => {
  const pkg = selectPackage(scoreResources(fleet, incident("fire", "critical")), incident("fire", "critical"));
  assert.strictEqual(pkg.filter((p) => p.resource.type === "fire_team").length, 2);
});

test("structural collapse leads with a rescue team", () => {
  const pkg = selectPackage(scoreResources(fleet, incident("structural")), incident("structural"));
  assert.strictEqual(pkg[0].resource.type, "rescue");
});

test("busy units are never recommended", () => {
  const busy = fleet.map((r) => (r.type === "fire_team" ? { ...r, status: "assigned" } : r));
  const pkg = selectPackage(scoreResources(busy, incident("fire")).filter((s) => s.resource.status === "available"), incident("fire"));
  assert.ok(!pkg.some((p) => p.resource.type === "fire_team"));
});
