/**
 * Notification service — SMS (Twilio), e-mail (SendGrid), in-app / live push (Socket.IO).
 *
 *  - Role-based: alerts go to operators/admins, dispatches to the assigned responders,
 *    possible-casualty heads-ups to hospital users, resolution notices to the citizen who reported.
 *  - Per-user preferences (email / sms / push) and phone number.
 *  - Every message is a Notification row = delivery tracking. Failed sends are retried
 *    (3 attempts, back-off 30 s then 2 min) by a cron job; after that the status is "failed".
 *  - Without provider credentials the "console" provider simulates delivery (status "sent",
 *    provider "console") so the whole flow is demonstrable offline.
 *
 * Env: SENDGRID_API_KEY + NOTIFY_FROM_EMAIL, TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM.
 */
const cron = require("node-cron");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Incident = require("../models/Incident");

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [30 * 1000, 2 * 60 * 1000];
const HTTP_TIMEOUT_MS = 8000;

let realtime = null;
const setIO = (rt) => { realtime = rt; };

// ── providers ────────────────────────────────────────────────────────────────
async function postWithTimeout(url, options) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const providers = {
  async email({ to, subject, body }) {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.NOTIFY_FROM_EMAIL;
    if (!key || !from) return consoleProvider("email", { to, subject, body });
    const res = await postWithTimeout("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: "PS-9 Emergency Platform" },
        subject,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { provider: "sendgrid", messageId: res.headers.get("x-message-id") };
  },

  async sms({ to, body }) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) return consoleProvider("sms", { to, body });
    const res = await postWithTimeout(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body.slice(0, 600) }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${data.message || "send failed"}`);
    return { provider: "twilio", messageId: data.sid };
  },
};

function consoleProvider(channel, msg) {
  if (process.env.NODE_ENV !== "test") console.log(`[notify:console] ${channel} → ${msg.to}: ${msg.subject || msg.body.slice(0, 80)}`);
  return { provider: "console", messageId: null };
}

/** Test hook: replace a channel provider. */
function setProvider(channel, fn) { providers[channel] = fn; }

// ── delivery with retry ──────────────────────────────────────────────────────
async function deliver(n) {
  const send = providers[n.channel];
  n.attempts += 1;
  try {
    const result = await send({ to: n.to, subject: n.subject, body: n.body });
    n.status = "sent";
    n.provider = result.provider;
    n.providerMessageId = result.messageId || null;
    n.sentAt = new Date();
    n.lastError = null;
    n.nextAttemptAt = null;
  } catch (err) {
    n.lastError = String(err.message || err).slice(0, 300);
    if (n.attempts >= MAX_ATTEMPTS) {
      n.status = "failed";
      n.nextAttemptAt = null;
    } else {
      n.status = "pending";
      n.nextAttemptAt = new Date(Date.now() + BACKOFF_MS[n.attempts - 1]);
    }
  }
  await n.save();
  return n;
}

async function retryDue(now = new Date()) {
  const due = await Notification.find({ status: "pending", channel: { $in: ["email", "sms"] }, nextAttemptAt: { $lte: now } }).limit(50);
  for (const n of due) await deliver(n);
  return due.length;
}

function startNotificationCron() {
  let running = false;
  cron.schedule("* * * * *", async () => {
    if (running) return;
    running = true;
    try { await retryDue(); } catch (err) { console.error("Notification retry error:", err.message); } finally { running = false; }
  });
  console.log("Notification retry cron started");
}

// ── building + routing ───────────────────────────────────────────────────────
function inAppPayload(n) {
  return { _id: n._id, type: n.type, title: n.subject, body: n.body, incidentId: n.incidentPublicId, read: n.read, createdAt: n.createdAt };
}

/**
 * Create notifications for the given users. channels ⊆ ["in_app","email","sms"].
 * Returns the created rows. Never throws (notification problems must not break emergency handling).
 */
async function notifyUsers(users, { type, title, body, incident = null, alert = null, channels = ["in_app"], dedupe = null }) {
  const created = [];
  try {
    const seen = new Set();
    for (const user of users) {
      if (!user || seen.has(String(user._id))) continue;
      seen.add(String(user._id));
      if (user.isActive === false) continue;

      const prefs = user.notificationPrefs || {};
      const base = {
        type,
        recipientUser: user._id,
        recipientRole: user.role,
        subject: title,
        body,
        incidentId: incident ? incident._id : null,
        incidentPublicId: incident ? incident.publicId : null,
        alertId: alert ? alert._id : null,
      };
      const key = (ch) => (dedupe ? `${dedupe}:${ch}:${user._id}` : null);

      for (const channel of channels) {
        if (key(channel) && (await Notification.exists({ dedupeKey: key(channel) }))) continue;

        if (channel === "in_app") {
          const n = await Notification.create({ ...base, channel, to: "in-app", status: "delivered", provider: "in_app", sentAt: new Date(), attempts: 1, dedupeKey: key(channel) });
          created.push(n);
          if (realtime && realtime.emitToUser && prefs.push !== false) realtime.emitToUser(user._id, "notification:new", inAppPayload(n));
        } else if (channel === "email") {
          if (prefs.email === false) continue;
          if (!user.email) continue;
          const n = await Notification.create({ ...base, channel, to: user.email, dedupeKey: key(channel) });
          created.push(await deliver(n));
        } else if (channel === "sms") {
          if (prefs.sms === false) continue;
          if (!user.phone) {
            created.push(await Notification.create({ ...base, channel, to: null, status: "skipped", lastError: "No phone number on file", dedupeKey: key(channel) }));
            continue;
          }
          const n = await Notification.create({ ...base, channel, to: user.phone, dedupeKey: key(channel) });
          created.push(await deliver(n));
        }
      }
    }
  } catch (err) {
    console.error("Notification error:", err.message);
  }
  return created;
}

const usersWithRoles = (roles) => User.find({ role: { $in: roles }, isActive: true });

const ALERT_ROUTES = {
  critical_incident: { roles: ["operator", "admin"], channels: ["in_app", "email", "sms"] },
  escalation_critical: { roles: ["operator", "admin"], channels: ["in_app", "email", "sms"] },
  escalation_warning: { roles: ["operator", "admin"], channels: ["in_app", "email"] },
  resource_delayed: { roles: ["operator", "admin"], channels: ["in_app", "email"] },
  resource_shortage: { roles: ["operator", "admin"], channels: ["in_app", "email"] },
  duplicate_candidate: { roles: ["operator", "admin"], channels: ["in_app"] },
};

/** Called by alert.service for every alert. */
async function notifyForAlert(alert) {
  const route = ALERT_ROUTES[alert.type] || { roles: ["operator", "admin"], channels: ["in_app"] };
  const incident = alert.incidentId ? await Incident.findById(alert.incidentId).select("publicId") : null;
  const users = await usersWithRoles(route.roles);
  return notifyUsers(users, {
    type: alert.type,
    title: alert.title,
    body: alert.message,
    incident,
    alert,
    channels: route.channels,
    dedupe: `alert:${alert._id}`,
  });
}

/** Responders learn about a new dispatch. `resources` must have responderUser populated or as id. */
async function notifyDispatch(incident, resources) {
  const ids = new Set(resources.map((r) => r.responderUser && String(r.responderUser._id || r.responderUser)).filter(Boolean));
  if (incident.assignedResponder) ids.add(String(incident.assignedResponder._id || incident.assignedResponder));
  if (!ids.size) return [];
  const users = await User.find({ _id: { $in: [...ids] }, isActive: true });
  const names = resources.map((r) => r.publicId).join(", ");
  return notifyUsers(users, {
    type: "dispatch",
    title: `New assignment: ${incident.publicId} (${incident.priority} ${incident.type})`,
    body: `${names} dispatched to ${incident.address || "reported location"}. Open the Responder page to accept.`,
    incident,
    channels: ["in_app", "sms", "email"],
    dedupe: `dispatch:${incident._id}:${resources.map((r) => r.publicId).sort().join("+")}`,
  });
}

const CASUALTY_TYPES = ["medical", "accident", "fire", "industrial", "structural", "flood"];

/** Hospitals get an early heads-up about possible casualties. */
async function notifyHospitals(incident) {
  if (!CASUALTY_TYPES.includes(incident.type) || !["high", "critical"].includes(incident.severity)) return [];
  const users = await usersWithRoles(["hospital"]);
  return notifyUsers(users, {
    type: "hospital_alert",
    title: `Possible incoming casualties — ${incident.type} (${incident.severity})`,
    body: `${incident.publicId} at ${incident.address || "reported location"}. Please check bed and staff availability.`,
    incident,
    channels: ["in_app", "email"],
    dedupe: `hospital:${incident._id}`,
  });
}

/** The citizen who reported (if signed in) is told when it is resolved. */
async function notifyResolved(incident) {
  if (!incident.createdBy) return [];
  const user = await User.findById(incident.createdBy);
  if (!user || user.role !== "citizen") return [];
  return notifyUsers([user], {
    type: "incident_resolved",
    title: `Your report ${incident.publicId} has been resolved`,
    body: `The emergency you reported near ${incident.address || "your location"} has been marked resolved. Thank you for helping.`,
    incident,
    channels: ["in_app", "email"],
    dedupe: `resolved:${incident._id}`,
  });
}

/** Fire-and-forget wrapper: awaited in tests (deterministic), background otherwise. */
function run(promise) {
  const safe = promise.catch((err) => console.error("Notification error:", err.message));
  return process.env.NODE_ENV === "test" ? safe : undefined;
}

module.exports = {
  setIO, setProvider, deliver, retryDue, startNotificationCron,
  notifyUsers, notifyForAlert, notifyDispatch, notifyHospitals, notifyResolved, run,
  MAX_ATTEMPTS,
};
