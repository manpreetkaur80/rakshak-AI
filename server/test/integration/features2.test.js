const test = require("node:test");
const assert = require("node:assert");
const { setup, teardown, auth, report, request } = require("./helpers");
const Incident = require("../../src/models/Incident");
const Resource = require("../../src/models/Resource");
const config = require("../../src/services/config.service");
const cred = require("../../src/services/credibility.service");

let ctx, api;
test.before(async () => { ctx = await setup(); api = (m, url) => request(ctx.app)[m](`/api/v1${url}`); });
test.after(teardown);

const LON = 72.9, LAT = 23.4;

// ── credibility ──────────────────────────────────────────────────────────────
test("credibility: genuine report scores high, prank/junk scores low (unit)", async () => {
  const good = await cred.assess({ description: "Large fire at the market, people trapped on the first floor", sourceType: "web", user: null, coordinates: [1, 1] });
  assert.strictEqual(good.level, "high");
  const bad = await cred.assess({ description: "lol test", sourceType: "web", user: null, coordinates: [2, 2] });
  assert.strictEqual(bad.level, "low");
  assert.ok(bad.flags.length >= 1);
  const gib = await cred.assess({ description: "qwrtp zxcvb nnnmmm ssdfgh", sourceType: "web", user: null, coordinates: [3, 3] });
  assert.ok(gib.score < good.score);
  const sensor = await cred.assess({ description: "Smoke sensor reading 400", sourceType: "sensor" });
  assert.strictEqual(sensor.level, "high");
  const up = cred.corroborate(bad, ["web", "call", "sensor"]);
  assert.ok(up.score > bad.score);
});

test("low-credibility P1 report: warning instead of P1 alarm, hidden from public view, operator can dismiss it", async () => {
  const r = await api("post", "/incidents").send(report(LON, LAT, "fire fire fire fire fire fire lol"));
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.data.incident.credibility, undefined, "citizens must not see credibility");
  const id = r.body.data.trackingId;
  const full = (await api("get", `/incidents/${id}`).set(auth(ctx.tokens.operator))).body.data;
  assert.strictEqual(full.credibility.level, "low");
  const alerts = (await api("get", "/alerts").set(auth(ctx.tokens.operator))).body.data.filter((a) => a.incidentId && a.incidentId.publicId === id);
  assert.ok(!alerts.some((a) => a.severity === "critical"), "no critical alarm for a suspicious report");

  assert.strictEqual((await api("post", `/incidents/${id}/dismiss`).set(auth(ctx.tokens.citizen)).send({})).status, 403);
  const d = await api("post", `/incidents/${id}/dismiss`).set(auth(ctx.tokens.operator)).send({ reason: "prank call" });
  assert.strictEqual(d.status, 200);
  const after = (await api("get", `/incidents/${id}`).set(auth(ctx.tokens.operator))).body.data;
  assert.strictEqual(after.status, "CLOSED");
  assert.match(after.resolution.resolutionNote, /False report: prank call/);
  assert.strictEqual((await api("post", `/incidents/${id}/dismiss`).set(auth(ctx.tokens.operator)).send({})).status, 400);
});

test("same account flooding reports loses credibility", async () => {
  for (let i = 0; i < 3; i++) await api("post", "/incidents").set(auth(ctx.tokens.citizen)).send(report(LON + 1 + i * 0.01, LAT, "Car accident on the ring road, one person injured"));
  const r = await api("post", "/incidents").set(auth(ctx.tokens.citizen)).send(report(LON + 1.5, LAT, "Car accident on the ring road, one person injured"));
  const inc = await Incident.findOne({ publicId: r.body.data.trackingId });
  assert.ok(inc.credibility.flags.some((f) => /same account/.test(f)));
});

// ── auto-dispatch / recall ───────────────────────────────────────────────────
test("one-click auto-dispatch sends the whole package; operator can recall it", async () => {
  const r = await api("post", "/incidents").send(report(LON + 3, LAT, "Large fire at the warehouse, people trapped inside"));
  const id = r.body.data.trackingId;
  assert.strictEqual((await api("post", `/incidents/${id}/auto-dispatch`).set(auth(ctx.tokens.citizen)).send({})).status, 403);
  const d = await api("post", `/incidents/${id}/auto-dispatch`).set(auth(ctx.tokens.operator)).send({});
  assert.strictEqual(d.status, 200);
  const types = (await Resource.find({ publicId: { $in: d.body.data.assignedResources } })).map((x) => x.type);
  assert.ok(types.includes("fire_team") && types.includes("ambulance"), types.join());
  const inc = await Incident.findOne({ publicId: id });
  assert.strictEqual(inc.status, "ASSIGNED");
  assert.strictEqual(inc.autoDispatched, true);

  const rc = await api("post", `/incidents/${id}/recall`).set(auth(ctx.tokens.operator)).send({});
  assert.strictEqual(rc.status, 200);
  assert.ok(rc.body.data.released.length >= 2);
  const back = await Incident.findOne({ publicId: id });
  assert.strictEqual(back.status, "CLASSIFIED");
  assert.strictEqual(back.autoDispatched, false);
  assert.strictEqual(await Resource.countDocuments({ currentIncident: back._id }), 0);
  assert.strictEqual((await api("post", `/incidents/${id}/recall`).set(auth(ctx.tokens.operator)).send({})).status, 409);
});

test("auto-dispatch setting: validated, and when ON a credible P1 is dispatched automatically (suspicious ones are not)", async () => {
  assert.strictEqual((await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ autoDispatch: { enabled: "yes" } })).status, 400);
  assert.strictEqual((await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ autoDispatch: { minPriority: "P9" } })).status, 400);
  const ok = await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ autoDispatch: { enabled: true, minPriority: "P1" } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(ok.body.data.autoDispatch.enabled, true);

  const good = await api("post", "/incidents").send(report(LON + 5, LAT, "Huge fire at the chemical plant, people trapped and injured, explosion heard"));
  const inc = await Incident.findOne({ publicId: good.body.data.trackingId });
  assert.strictEqual(inc.autoDispatched, true);
  assert.ok(inc.assignedResources.length >= 2);
  assert.ok(inc.timeline.some((e) => /Auto-dispatch/.test(e.message)));

  const bad = await api("post", "/incidents").send(report(LON + 7, LAT, "lol big fire prank"));
  const b = await Incident.findOne({ publicId: bad.body.data.trackingId });
  assert.strictEqual(b.assignedResources.length, 0, "suspicious reports are never auto-dispatched");

  await api("put", "/admin/config").set(auth(ctx.tokens.admin)).send({ autoDispatch: { enabled: false } });
  const off = await api("post", "/incidents").send(report(LON + 9, LAT, "Huge fire at the textile mill, people trapped and injured"));
  assert.strictEqual((await Incident.findOne({ publicId: off.body.data.trackingId })).assignedResources.length, 0);
});

// ── PDF report ───────────────────────────────────────────────────────────────
test("post-incident PDF report: staff only, valid PDF", async () => {
  const r = await api("post", "/incidents").send(report(LON + 11, LAT, "Gas leak at the chemical factory, workers coughing"));
  const id = r.body.data.trackingId;
  await api("post", `/incidents/${id}/auto-dispatch`).set(auth(ctx.tokens.operator)).send({});
  await api("post", `/incidents/${id}/resolve`).set(auth(ctx.tokens.operator)).send({ note: "Leak sealed" });
  assert.strictEqual((await api("get", `/incidents/${id}/report`)).status, 401);
  assert.strictEqual((await api("get", `/incidents/${id}/report`).set(auth(ctx.tokens.citizen))).status, 403);
  assert.strictEqual((await api("get", "/incidents/INC-999999/report").set(auth(ctx.tokens.operator))).status, 404);
  const pdf = await api("get", `/incidents/${id}/report`).set(auth(ctx.tokens.operator)).buffer(true).parse((res, cb) => {
    const chunks = []; res.on("data", (c) => chunks.push(c)); res.on("end", () => cb(null, Buffer.concat(chunks)));
  });
  assert.strictEqual(pdf.status, 200);
  assert.match(pdf.headers["content-type"], /application\/pdf/);
  assert.match(pdf.headers["content-disposition"], new RegExp(`${id}_report.pdf`));
  assert.strictEqual(pdf.body.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.body.length > 1500);
});
