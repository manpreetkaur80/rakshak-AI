const test = require("node:test");
const assert = require("node:assert");
const { setup, teardown, auth, report, request } = require("./helpers");
const Incident = require("../../src/models/Incident");
const Resource = require("../../src/models/Resource");
const { checkEscalations } = require("../../src/services/escalation.service");
const config = require("../../src/services/config.service");

let ctx;
let api;
test.before(async () => {
  ctx = await setup();
  api = (m, url) => request(ctx.app)[m](`/api/v1${url}`);
});
test.after(teardown);

const [LON, LAT] = [72.5714, 23.0225];

test("many simultaneous reports all succeed with unique IDs (no publicId race)", async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => api("post", "/incidents").send(report(72.30 + i * 0.05, 22.5, `Car crash number ${i} on highway`)))
  );
  assert.deepStrictEqual([...new Set(results.map((r) => r.status))], [201]);
  const ids = results.map((r) => r.body.data.trackingId);
  assert.strictEqual(new Set(ids).size, 12);
});

test("anonymous report works and only returns the public view", async () => {
  const res = await api("post", "/incidents").send(report(LON + 0.5, LAT + 0.5, "Large fire at the warehouse, smoke everywhere"));
  assert.strictEqual(res.status, 201);
  const inc = res.body.data.incident;
  assert.strictEqual(inc.type, "fire");
  assert.ok(inc.publicId.startsWith("INC-"));
  for (const hidden of ["sourceReports", "createdBy", "assignedResources", "duplicateCandidates"]) assert.ok(!(hidden in inc), hidden);
});

test("validation: bad coordinates / empty description are rejected", async () => {
  assert.strictEqual((await api("post", "/incidents").send(report(500, 10, "fire"))).status, 400);
  assert.strictEqual((await api("post", "/incidents").send(report("a", 10, "fire"))).status, 400);
  assert.strictEqual((await api("post", "/incidents").send(report(10, 10, "   "))).status, 400);
  assert.strictEqual((await api("post", "/incidents").send({ description: "fire" })).status, 400);
});

test("public tracking view hides internals; staff get full record", async () => {
  const created = await api("post", "/incidents").send(report(LON + 1, LAT + 1, "Heavy flooding in the colony, water level rising"));
  const id = created.body.data.trackingId;
  const pub = await api("get", `/incidents/${id}`);
  assert.strictEqual(pub.status, 200);
  assert.ok(!("sourceReports" in pub.body.data) && !("createdBy" in pub.body.data));
  assert.ok(pub.body.data.timeline.every((t) => !/FT-|AMB-/.test(t.message)));
  const staff = await api("get", `/incidents/${id}`).set(auth(ctx.tokens.operator));
  assert.ok(Array.isArray(staff.body.data.sourceReports));
});

let primary; // fire incident used in the dispatch flow
test("duplicate detection → merge keeps the older incident → unmerge restores", async () => {
  const a = await api("post", "/incidents").send(report(LON, LAT, "Large fire near Central Market, heavy smoke, people trapped"));
  primary = a.body.data.trackingId;
  assert.strictEqual(a.body.data.incident.status, "CLASSIFIED");

  const b = await api("post", "/incidents").set(auth(ctx.tokens.citizen)).send(report(LON + 0.0012, LAT, "Flames and smoke at the bazaar, people stuck inside"));
  const bid = b.body.data.trackingId;
  assert.strictEqual(b.body.data.incident.status, "DUPLICATE_CANDIDATE");

  // Operator merges, calling it "the wrong way round" (older id as source)
  const m = await api("post", `/incidents/${bid}/merge`).set(auth(ctx.tokens.operator)).send({ sourceIncidentId: primary });
  assert.strictEqual(m.status, 200);
  assert.strictEqual(m.body.data.primaryId, primary);
  assert.strictEqual(m.body.data.mergedId, bid);

  const full = (await api("get", `/incidents/${primary}`).set(auth(ctx.tokens.operator))).body.data;
  assert.strictEqual(full.sourceReports.length, 2);
  const merged = await Incident.findOne({ publicId: bid });
  assert.strictEqual(merged.status, "MERGED");

  const u = await api("post", `/incidents/${bid}/unmerge`).set(auth(ctx.tokens.operator)).send({});
  assert.strictEqual(u.status, 200);
  assert.strictEqual((await Incident.findOne({ publicId: bid })).status, "CLASSIFIED");
  assert.strictEqual((await Incident.findOne({ publicId: primary })).sourceReports.length, 1);
});

test("operator can reject a duplicate suggestion", async () => {
  const a = await api("post", "/incidents").send(report(LON - 0.3, LAT, "Large fire near Old Mill, heavy smoke"));
  const b = await api("post", "/incidents").send(report(LON - 0.3 + 0.0005, LAT, "Fire and smoke at the old mill"));
  const bid = b.body.data.trackingId;
  assert.strictEqual(b.body.data.incident.status, "DUPLICATE_CANDIDATE");
  const r = await api("post", `/incidents/${bid}/reject-duplicate`).set(auth(ctx.tokens.operator)).send({ candidateId: a.body.data.trackingId });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.data.status, "CLASSIFIED");
});

test("recommendations form a response package (fire team + ambulance + police), no hospitals", async () => {
  const res = await api("get", `/resources/recommendations/${primary}`).set(auth(ctx.tokens.operator));
  assert.strictEqual(res.status, 200);
  const types = res.body.data.map((r) => r.type);
  assert.ok(types.includes("fire_team") && types.includes("ambulance") && types.includes("police"));
  assert.ok(!types.includes("hospital"));
  assert.ok(res.body.data[0].reason);
});

test("RBAC: citizens and anonymous cannot list incidents, dispatch or get recommendations", async () => {
  assert.strictEqual((await api("get", "/incidents")).status, 401);
  assert.strictEqual((await api("get", "/incidents").set(auth(ctx.tokens.citizen))).status, 403);
  assert.strictEqual((await api("post", `/incidents/${primary}/assign`).set(auth(ctx.tokens.citizen)).send({ resourceIds: ["FT-01"] })).status, 403);
  assert.strictEqual((await api("post", `/incidents/${primary}/status`).set(auth(ctx.tokens.citizen)).send({ status: "EN_ROUTE" })).status, 403);
  assert.strictEqual((await api("get", "/admin/users").set(auth(ctx.tokens.operator))).status, 403);
});

test("dispatch → responder sees it → accept → en route → on scene → resolve frees units", async () => {
  const assign = await api("post", `/incidents/${primary}/assign`).set(auth(ctx.tokens.operator)).send({ resourceIds: ["FT-01", "AMB-01", "FT-02"] });
  assert.strictEqual(assign.status, 200);
  assert.deepStrictEqual(assign.body.data.assignedResources.sort(), ["AMB-01", "FT-01", "FT-02"]);

  // a busy unit cannot be double-booked
  const other = await api("post", "/incidents").send(report(LON + 0.7, LAT, "Fire in a godown"));
  const dbl = await api("post", `/incidents/${other.body.data.trackingId}/assign`).set(auth(ctx.tokens.operator)).send({ resourceIds: ["FT-01"] });
  assert.strictEqual(dbl.status, 409);

  // responder1 owns FT-01/AMB-01 → sees the incident; responder2 owns FT-02 → also sees it; a fresh unrelated incident is hidden
  const list1 = await api("get", "/incidents").set(auth(ctx.tokens.responder1));
  assert.deepStrictEqual(list1.body.data.map((i) => i.publicId), [primary]);

  const accept = await api("post", `/incidents/${primary}/accept`).set(auth(ctx.tokens.responder1)).send({});
  assert.strictEqual(accept.status, 200);
  assert.strictEqual((await api("post", `/incidents/${primary}/accept`).set(auth(ctx.tokens.responder1)).send({})).status, 400);

  const enroute = await api("post", `/incidents/${primary}/status`).set(auth(ctx.tokens.responder1)).send({ status: "EN_ROUTE" });
  assert.strictEqual(enroute.status, 200);
  assert.strictEqual((await Resource.findOne({ publicId: "FT-01" })).status, "en_route");
  assert.strictEqual((await Resource.findOne({ publicId: "FT-02" })).status, "assigned"); // responder2's unit untouched

  // invalid jump
  assert.strictEqual((await api("post", `/incidents/${primary}/status`).set(auth(ctx.tokens.responder1)).send({ status: "CLOSED" })).status, 400);

  // adding another unit while en route must not move the incident backwards
  const extra = await api("post", `/incidents/${primary}/assign`).set(auth(ctx.tokens.operator)).send({ resourceIds: ["PU-01"] });
  assert.strictEqual(extra.body.data.status, "EN_ROUTE");

  assert.strictEqual((await api("post", `/incidents/${primary}/status`).set(auth(ctx.tokens.responder1)).send({ status: "ON_SCENE" })).status, 200);

  // Resolving through the status endpoint must also release units and stamp resolution time
  const done = await api("post", `/incidents/${primary}/status`).set(auth(ctx.tokens.responder1)).send({ status: "RESOLVED", note: "Fire contained" });
  assert.strictEqual(done.status, 200);
  const inc = await Incident.findOne({ publicId: primary });
  assert.strictEqual(inc.status, "RESOLVED");
  assert.ok(inc.resolution.resolvedAt);
  const busy = await Resource.countDocuments({ publicId: { $in: ["FT-01", "FT-02", "AMB-01", "PU-01"] }, status: { $ne: "available" } });
  assert.strictEqual(busy, 0);

  const util = await api("get", "/analytics/resources").set(auth(ctx.tokens.operator));
  assert.strictEqual(util.status, 200);
  assert.strictEqual(util.body.data.utilizationPercent, 0);
});

test("an unassigned responder cannot touch someone else's incident", async () => {
  const inc = await api("post", "/incidents").send(report(LON + 0.9, LAT, "Gas leak at the chemical factory"));
  const id = inc.body.data.trackingId;
  assert.strictEqual((await api("post", `/incidents/${id}/resolve`).set(auth(ctx.tokens.responder1)).send({})).status, 403);
  assert.strictEqual((await api("post", `/incidents/${id}/status`).set(auth(ctx.tokens.responder1)).send({ status: "EN_ROUTE" })).status, 403);
});

test("escalation progresses warning → critical, and raises alerts", async () => {
  const created = await api("post", "/incidents").send(report(LON + 1.5, LAT, "Explosion at the market, people trapped"));
  const id = created.body.data.trackingId;
  const inc = await Incident.findOne({ publicId: id });
  assert.strictEqual(inc.priority, "P1");

  const cfg = config.getEscalationConfig().P1;
  const at = (min) => new Date(inc.createdAt.getTime() + min * 60000);

  await checkEscalations(at(cfg.warningAfterMinutes + 0.1));
  assert.strictEqual((await Incident.findOne({ publicId: id })).escalation.level, "warning");

  await checkEscalations(at(cfg.criticalAfterMinutes + 0.1));
  assert.strictEqual((await Incident.findOne({ publicId: id })).escalation.level, "critical");

  // no repeat alerts at the same level
  const before = (await api("get", "/alerts").set(auth(ctx.tokens.operator))).body.data.filter((a) => a.incidentId && a.incidentId.publicId === id).length;
  await checkEscalations(at(cfg.criticalAfterMinutes + 3));
  const after = (await api("get", "/alerts").set(auth(ctx.tokens.operator))).body.data.filter((a) => a.incidentId && a.incidentId.publicId === id).length;
  assert.strictEqual(after, before);
  const kinds = (await api("get", "/alerts").set(auth(ctx.tokens.operator))).body.data.filter((a) => a.incidentId && a.incidentId.publicId === id).map((a) => a.type);
  assert.ok(kinds.includes("critical_incident") && kinds.includes("escalation_warning") && kinds.includes("escalation_critical"));
});

test("delayed-response alert fires once for assigned incidents that never reach the scene", async () => {
  const created = await api("post", "/incidents").send(report(LON + 2, LAT, "Building collapsed, people trapped"));
  const id = created.body.data.trackingId;
  await api("post", `/incidents/${id}/assign`).set(auth(ctx.tokens.operator)).send({ resourceIds: ["RST-01"] });
  const inc = await Incident.findOne({ publicId: id });
  const late = new Date(inc.createdAt.getTime() + (config.getEscalationConfig().P1.onSceneAfterMinutes + 1) * 60000);
  const r1 = await checkEscalations(late);
  const r2 = await checkEscalations(late);
  assert.ok(r1.delayed >= 1);
  assert.strictEqual(r2.delayed, 0);
});

test("admin config: validated, persisted, and used by escalation", async () => {
  const bad = await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ escalation: { P1: { warningAfterMinutes: 9, criticalAfterMinutes: 3 } } });
  assert.strictEqual(bad.status, 400);
  const ok = await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ escalation: { P1: { warningAfterMinutes: 1, criticalAfterMinutes: 2 } }, duplicate: { threshold: 0.8 } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.escalation.P1.warningAfterMinutes, 1);
  assert.strictEqual(ok.body.data.duplicate.threshold, 0.8);
  assert.strictEqual(config.getEscalationConfig().P1.criticalAfterMinutes, 2);
  config.reset();
});

test("admin user management: create staff, change role, cannot demote or deactivate self", async () => {
  const created = await api("post", "/admin/users").set(auth(ctx.tokens.admin)).send({ name: "New Op", email: "newop@test.com", password: "longenough1", role: "operator" });
  assert.strictEqual(created.status, 201);
  assert.ok(!("passwordHash" in created.body.data));
  const patched = await api("patch", `/admin/users/${created.body.data._id}`).set(auth(ctx.tokens.admin)).send({ role: "responder", isActive: false });
  assert.strictEqual(patched.body.data.role, "responder");
  assert.strictEqual(patched.body.data.isActive, false);
  const me = await api("get", "/auth/me").set(auth(ctx.tokens.admin));
  assert.strictEqual((await api("patch", `/admin/users/${me.body.data.id}`).set(auth(ctx.tokens.admin)).send({ isActive: false })).status, 400);
  assert.strictEqual((await api("patch", `/admin/users/${me.body.data.id}`).set(auth(ctx.tokens.admin)).send({ role: "citizen" })).status, 400);
});

test("registration can only create citizens", async () => {
  const r = await api("post", "/auth/register").send({ name: "Sneaky", email: "sneaky@test.com", password: "password123", role: "admin" });
  assert.strictEqual(r.body.data.user.role, "citizen");
});

test("image upload accepts png, rejects other types", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  const ok = await api("post", "/uploads").attach("image", png, { filename: "x.png", contentType: "image/png" });
  assert.strictEqual(ok.status, 201);
  assert.match(ok.body.data.url, /^\/uploads\/[\w-]+\.png$/);
  const bad = await api("post", "/uploads").attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.html", contentType: "text/html" });
  assert.strictEqual(bad.status, 400);
});

test("search input is treated literally (no regex injection)", async () => {
  const res = await api("get", "/incidents").query({ search: "(((" }).set(auth(ctx.tokens.operator));
  assert.strictEqual(res.status, 200);
});
