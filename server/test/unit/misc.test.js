const test = require("node:test");
const assert = require("node:assert");
const { toPublicPayload } = require("../../src/sockets/socketHandler");
const config = require("../../src/services/config.service");

test("public socket payload exposes only id/status", () => {
  const p = toPublicPayload("incident:updated", { publicId: "INC-1", status: "ASSIGNED", description: "secret", assignedResources: [1] });
  assert.deepStrictEqual(Object.keys(p).sort(), ["publicId", "status", "updatedAt"]);
});

test("public clients get nothing for staff-only events", () => {
  assert.strictEqual(toPublicPayload("alert:created", { message: "x" }), null);
  assert.strictEqual(toPublicPayload("incident:created", { publicId: "INC-1" }), null);
  assert.strictEqual(toPublicPayload("incident:updated", { publicId: "INC-1", severity: "high" }), null);
});

test("config rejects invalid values", async () => {
  config.reset();
  await assert.rejects(() => config.update({ escalation: { P1: { warningAfterMinutes: 10, criticalAfterMinutes: 3 } } }), /criticalAfterMinutes/);
  await assert.rejects(() => config.update({ duplicate: { threshold: 5 } }), /threshold/);
  await assert.rejects(() => config.update({ escalation: { P9: { warningAfterMinutes: 1 } } }), /Unknown priority/);
});
