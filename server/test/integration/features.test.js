const test = require("node:test");
const assert = require("node:assert");
const { setup, teardown, auth, report, request } = require("./helpers");
const Incident = require("../../src/models/Incident");
const Resource = require("../../src/models/Resource");
const Notification = require("../../src/models/Notification");
const User = require("../../src/models/User");
const notif = require("../../src/services/notification.service");
const { checkEscalations } = require("../../src/services/escalation.service");
const config = require("../../src/services/config.service");

let ctx, api;
const sent = { email: [], sms: [] };
let failEmail = 0; // number of upcoming email sends that should fail

test.before(async () => {
  process.env.INGEST_API_KEY = "test-ingest-key-123";
  ctx = await setup();
  api = (m, url) => request(ctx.app)[m](`/api/v1${url}`);
  notif.setProvider("email", async (msg) => {
    if (failEmail > 0) { failEmail--; throw new Error("SendGrid 503: unavailable"); }
    sent.email.push(msg);
    return { provider: "mock", messageId: "m1" };
  });
  notif.setProvider("sms", async (msg) => { sent.sms.push(msg); return { provider: "mock", messageId: "s1" }; });
  await User.updateOne({ _id: ctx.users.operator._id }, { phone: "+919800000001" });
});
test.after(teardown);

const KEY = { "x-api-key": "test-ingest-key-123" };
const [LON, LAT] = [72.5714, 23.0225];
const loc = (dx = 0) => ({ lat: LAT, lng: LON + dx });

// ── ingestion ────────────────────────────────────────────────────────────────
test("ingest: needs API key or an allowed staff login", async () => {
  const body = { sensorId: "S1", sensorType: "smoke", value: 400, location: loc() };
  assert.strictEqual((await api("post", "/ingest/sensor").send(body)).status, 401);
  assert.strictEqual((await api("post", "/ingest/sensor").set({ "x-api-key": "wrong-key-wrong-key" }).send(body)).status, 401);
  assert.strictEqual((await api("post", "/ingest/sensor").set(auth(ctx.tokens.citizen)).send(body)).status, 403);
  assert.strictEqual((await api("post", "/ingest/sensor").set(auth(ctx.tokens.responder1)).send(body)).status, 403);
  assert.strictEqual((await api("post", "/ingest/field").set(auth(ctx.tokens.responder1)).send({ message: "fire spreading", location: loc(0.5) })).status, 201);
});

test("ingest: smoke sensor above threshold opens a fire incident with raised severity", async () => {
  const r = await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "SMK-1", sensorType: "smoke", value: 350, location: loc(0.1), eventId: "evt-1" });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.data.type, "fire");
  assert.ok(["high", "critical"].includes(r.body.data.severity), r.body.data.severity);
  const inc = await Incident.findOne({ publicId: r.body.data.incidentId }).populate("sourceReports");
  assert.strictEqual(inc.sourceReports[0].sourceType, "sensor");
  assert.strictEqual(inc.sourceReports[0].sourceRef, "SMK-1");
});

test("ingest: readings below threshold are ignored (202); retries with the same eventId are idempotent", async () => {
  const low = await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "SMK-9", sensorType: "smoke", value: 20, location: loc(0.2) });
  assert.strictEqual(low.status, 202);
  assert.strictEqual(low.body.data.ignored, true);

  const again = await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "SMK-1", sensorType: "smoke", value: 350, location: loc(0.1), eventId: "evt-1" });
  assert.strictEqual(again.status, 200);
  assert.strictEqual(again.body.data.created, false);
});

test("ingest: repeated alarms from the same sensor attach to the same incident and can raise severity", async () => {
  const first = await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "GAS-7", sensorType: "gas", value: 60, location: loc(0.3) });
  const second = await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "GAS-7", sensorType: "gas", value: 200, location: loc(0.3) });
  assert.strictEqual(second.status, 201);
  assert.strictEqual(second.body.data.attached, true);
  assert.strictEqual(second.body.data.incidentId, first.body.data.incidentId);
  const inc = await Incident.findOne({ publicId: first.body.data.incidentId });
  assert.strictEqual(inc.sourceReports.length, 2);
  assert.strictEqual(inc.severity, "critical");
});

test("ingest: call transcript, hospital, govt feeds; caller phone is masked", async () => {
  const call = await api("post", "/ingest/call").set(KEY).send({ callId: "C1", callerPhone: "+919812345678", transcript: "Building collapsed near the bridge, people trapped", location: loc(0.4) });
  assert.strictEqual(call.status, 201);
  assert.strictEqual(call.body.data.type, "structural");
  const rep = await Incident.findOne({ publicId: call.body.data.incidentId }).populate("sourceReports");
  assert.strictEqual(rep.sourceReports[0].metadata.callerPhone, "****5678");
  assert.ok(!JSON.stringify(rep.sourceReports[0]).includes("9812345678"));

  const hosp = await api("post", "/ingest/hospital").set(KEY).send({ hospitalName: "City Hospital", incomingCasualties: 12, message: "Multiple burn victims arriving", location: loc(0.6) });
  assert.strictEqual(hosp.status, 201);
  assert.strictEqual(hosp.body.data.severity, "critical");

  const govt = await api("post", "/ingest/govt").set(KEY).send({ agency: "IMD", alertType: "weather", severity: "red", message: "Heavy rain, flooding expected", location: loc(0.7) });
  assert.strictEqual(govt.status, 201);
  assert.strictEqual(govt.body.data.type, "flood");
});

test("ingest: validation errors", async () => {
  assert.strictEqual((await api("post", "/ingest/sensor").set(KEY).send({ sensorType: "smoke", value: 5, location: loc() })).status, 400);
  assert.strictEqual((await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "x", sensorType: "laser", value: 5, location: loc() })).status, 400);
  assert.strictEqual((await api("post", "/ingest/call").set(KEY).send({ transcript: "fire" })).status, 400);
  assert.strictEqual((await api("post", "/ingest/nonsense").set(KEY).send({})).status, 400);
});

test("multi-source corroboration: call + app + sensor about one fire end up as ONE incident with 3 sources", async () => {
  const at = LON + 1.2;
  await api("post", "/ingest/call").set(KEY).send({ transcript: "Big fire at the old market, smoke everywhere", location: loc(1.2) });
  await api("post", "/incidents").send(report(at + 0.0004, LAT, "Flames and smoke at the old market, people trapped"));
  await api("post", "/ingest/sensor").set(KEY).send({ sensorId: "SMK-55", sensorType: "smoke", value: 400, location: loc(1.2 + 0.0006) });
  const open = await Incident.find({ "location.coordinates.0": { $gt: at - 0.01, $lt: at + 0.01 }, status: { $ne: "MERGED" } });
  const dupes = open.filter((i) => i.status === "DUPLICATE_CANDIDATE");
  assert.ok(dupes.length >= 1, "later reports should be flagged as duplicate candidates");
  const op = ctx.tokens.operator;
  const survivor = open.sort((a, b) => a.createdAt - b.createdAt)[0];
  for (const d of dupes) await api("post", `/incidents/${d.publicId}/merge`).set(auth(op)).send({ sourceIncidentId: survivor.publicId });
  const full = (await api("get", `/incidents/${survivor.publicId}`).set(auth(op))).body.data;
  const kinds = new Set(full.sourceReports.map((r) => r.sourceType));
  assert.ok(kinds.size >= 3, [...kinds].join());
  const sum = (await api("post", `/incidents/${survivor.publicId}/summary`).set(auth(op)).send({})).body.data.summary;
  assert.match(sum, /sources/);
});

test("ingest: sources panel counts feeds; simulator needs operator", async () => {
  const s = await api("get", "/ingest/sources").set(auth(ctx.tokens.operator));
  assert.strictEqual(s.status, 200);
  const kinds = s.body.data.map((x) => x.sourceType);
  assert.ok(kinds.includes("sensor") && kinds.includes("call"));
  assert.strictEqual((await api("post", "/ingest/simulate").set(auth(ctx.tokens.citizen)).send({ source: "call" })).status, 403);
  const sim = await api("post", "/ingest/simulate").set(auth(ctx.tokens.operator)).send({ source: "hospital" });
  assert.strictEqual(sim.status, 201);
  assert.strictEqual((await api("post", "/ingest/simulate").set(auth(ctx.tokens.operator)).send({ source: "bogus" })).status, 400);
});

// ── notifications ────────────────────────────────────────────────────────────
test("P1 incident notifies operators/admins on in-app + email + SMS, and hospitals get a casualty heads-up", async () => {
  sent.email.length = 0; sent.sms.length = 0;
  const r = await api("post", "/incidents").send(report(LON + 2.5, LAT + 0.5, "Explosion at the factory, people trapped and injured"));
  const id = r.body.data.trackingId;

  const inbox = await api("get", "/notifications").set(auth(ctx.tokens.operator));
  assert.ok(inbox.body.data.some((n) => n.incidentId === id && n.type === "critical_incident"));
  assert.ok(sent.email.some((m) => /P1/.test(m.subject)), "operator e-mail");
  assert.deepStrictEqual(sent.sms.map((m) => m.to), ["+919800000001"]); // only the operator has a phone

  const log = await api("get", "/notifications/log").set(auth(ctx.tokens.admin));
  assert.ok(log.body.data.some((n) => n.channel === "sms" && n.status === "skipped"), "admin has no phone → skipped, not silently dropped");

  const hosp = await api("get", "/notifications").set(auth(ctx.tokens.hospital));
  assert.ok(hosp.body.data.some((n) => n.type === "hospital_alert" && n.incidentId === id));
});

test("preferences are respected and validated", async () => {
  assert.strictEqual((await api("patch", "/notifications/preferences").set(auth(ctx.tokens.operator)).send({ phone: "12345" })).status, 400);
  const p = await api("patch", "/notifications/preferences").set(auth(ctx.tokens.operator)).send({ sms: false });
  assert.strictEqual(p.body.data.sms, false);
  sent.sms.length = 0;
  await api("post", "/incidents").send(report(LON + 2.8, LAT + 0.7, "Explosion at the warehouse, people trapped"));
  assert.strictEqual(sent.sms.length, 0, "SMS disabled by the operator");
  await api("patch", "/notifications/preferences").set(auth(ctx.tokens.operator)).send({ sms: true });
});

test("failed e-mail is retried and eventually delivered; permanent failures are marked failed", async () => {
  const user = await User.findById(ctx.users.operator._id);
  failEmail = 1;
  const [n] = await notif.notifyUsers([user], { type: "system", title: "Retry me", body: "x", channels: ["email"] });
  assert.strictEqual(n.status, "pending");
  assert.strictEqual(n.attempts, 1);
  assert.match(n.lastError, /503/);
  assert.ok(n.nextAttemptAt);

  assert.strictEqual(await notif.retryDue(new Date(Date.now() + 60 * 1000)), 1);
  const after = await Notification.findById(n._id);
  assert.strictEqual(after.status, "sent");
  assert.strictEqual(after.attempts, 2);

  failEmail = 99;
  const [m] = await notif.notifyUsers([user], { type: "system", title: "Always fails", body: "x", channels: ["email"] });
  await notif.retryDue(new Date(Date.now() + 60 * 1000));
  await notif.retryDue(new Date(Date.now() + 10 * 60 * 1000));
  const dead = await Notification.findById(m._id);
  assert.strictEqual(dead.status, "failed");
  assert.strictEqual(dead.attempts, notif.MAX_ATTEMPTS);
  failEmail = 0;
});

test("dispatch notifies the responder who owns the unit; resolve notifies the signed-in citizen reporter", async () => {
  const created = await api("post", "/incidents").set(auth(ctx.tokens.citizen)).send(report(LON + 3.2, LAT, "Large fire in the godown, smoke"));
  const id = created.body.data.trackingId;
  sent.sms.length = 0;
  await api("post", `/incidents/${id}/assign`).set(auth(ctx.tokens.operator)).send({ resourceIds: ["FT-01"] });
  const inbox = await api("get", "/notifications").set(auth(ctx.tokens.responder1));
  assert.ok(inbox.body.data.some((n) => n.type === "dispatch" && n.incidentId === id));
  assert.strictEqual((await api("get", "/notifications").set(auth(ctx.tokens.responder2))).body.data.some((n) => n.incidentId === id), false);

  await api("post", `/incidents/${id}/resolve`).set(auth(ctx.tokens.operator)).send({ note: "done" });
  const cit = await api("get", "/notifications").set(auth(ctx.tokens.citizen));
  assert.ok(cit.body.data.some((n) => n.type === "incident_resolved" && n.incidentId === id));
});

test("inbox: mark read, mark all read; users cannot touch each other's notifications; log is admin-only", async () => {
  const mine = await api("get", "/notifications").set(auth(ctx.tokens.operator));
  assert.ok(mine.body.meta.unread > 0);
  const someone = (await api("get", "/notifications").set(auth(ctx.tokens.hospital))).body.data[0];
  assert.strictEqual((await api("patch", `/notifications/${someone._id}/read`).set(auth(ctx.tokens.operator))).status, 404);
  assert.strictEqual((await api("patch", `/notifications/${mine.body.data[0]._id}/read`).set(auth(ctx.tokens.operator))).status, 200);
  await api("post", "/notifications/read-all").set(auth(ctx.tokens.operator));
  assert.strictEqual((await api("get", "/notifications").set(auth(ctx.tokens.operator))).body.meta.unread, 0);
  assert.strictEqual((await api("get", "/notifications/log").set(auth(ctx.tokens.operator))).status, 403);
  assert.strictEqual((await api("get", "/notifications").query({ unread: "true" })).status, 401);
  const t = await api("post", "/notifications/test").set(auth(ctx.tokens.admin)).send({ channel: "email" });
  assert.strictEqual(t.status, 200);
  assert.strictEqual(t.body.data.status, "sent");
});

// ── analytics ────────────────────────────────────────────────────────────────
test("shortage: missing unit types raise an alert once; forecast flags high risk", async () => {
  await Resource.updateMany({ type: "police" }, { status: "unavailable", "availability.isAvailable": false });
  const inc = await api("post", "/incidents").send(report(LON + 4, LAT, "Large fire at the depot, people trapped"));
  const id = inc.body.data.trackingId;
  const r1 = await api("get", `/resources/recommendations/${id}`).set(auth(ctx.tokens.operator));
  assert.ok(r1.body.meta.missing.includes("police"));
  await api("get", `/resources/recommendations/${id}`).set(auth(ctx.tokens.operator));
  const alerts = (await api("get", "/alerts").set(auth(ctx.tokens.operator))).body.data.filter((a) => a.type === "resource_shortage" && a.incidentId && a.incidentId.publicId === id);
  assert.strictEqual(alerts.length, 1);

  const s = await api("get", "/analytics/shortages").set(auth(ctx.tokens.operator));
  assert.strictEqual(s.status, 200);
  const police = s.body.data.forecast.find((f) => f.type === "police");
  assert.strictEqual(police.available, 0);
  assert.strictEqual(police.risk, "high");
  assert.ok(s.body.data.events.some((e) => e.type === "police"));
  assert.ok(s.body.data.basis.incidentsConsidered > 0);
  await Resource.updateMany({ type: "police" }, { status: "available", "availability.isAvailable": true });
});

test("analytics date range filters results; CSV export is escaped and staff-only", async () => {
  const all = await api("get", "/analytics/types").set(auth(ctx.tokens.operator));
  const total = all.body.data.reduce((s, r) => s + r.count, 0);
  assert.ok(total > 5);
  const none = await api("get", "/analytics/types").query({ from: "2001-01-01", to: "2001-01-31" }).set(auth(ctx.tokens.operator));
  assert.deepStrictEqual(none.body.data, []);
  const today = new Date().toISOString().slice(0, 10);
  const todayRes = await api("get", "/analytics/types").query({ from: today, to: today }).set(auth(ctx.tokens.operator));
  assert.strictEqual(todayRes.body.data.reduce((s, r) => s + r.count, 0), total);

  await Incident.updateOne({}, { address: '=HYPERLINK("http://evil","x"), "quoted"' });
  const csv = await api("get", "/analytics/export").query({ from: today, to: today }).set(auth(ctx.tokens.operator));
  assert.strictEqual(csv.status, 200);
  assert.match(csv.headers["content-type"], /text\/csv/);
  assert.match(csv.headers["content-disposition"], /incidents_/);
  assert.match(csv.text, /incident_id,created_at/);
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://evil"",""x""), ""quoted"""`), "formula injection neutralised");
  assert.strictEqual((await api("get", "/analytics/export").set(auth(ctx.tokens.citizen))).status, 403);
  assert.strictEqual((await api("get", "/analytics/shortages").set(auth(ctx.tokens.citizen))).status, 403);
});
