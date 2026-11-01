const Notification = require("../models/Notification");
const User = require("../models/User");
const { notifyUsers } = require("../services/notification.service");

const fail = (res, status, message, code = "VALIDATION_ERROR") => res.status(status).json({ success: false, message, code });
const E164 = /^\+[1-9]\d{7,14}$/;

const format = (n) => ({
  _id: n._id,
  type: n.type,
  title: n.subject,
  body: n.body,
  incidentId: n.incidentPublicId,
  read: n.read,
  createdAt: n.createdAt,
});

// GET /notifications — the signed-in user's in-app inbox
const list = async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const filter = { recipientUser: req.user._id, channel: "in_app" };
    if (req.query.unread === "true") filter.read = false;
    const [items, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ recipientUser: req.user._id, channel: "in_app", read: false }),
    ]);
    res.json({ success: true, data: items.map(format), meta: { unread } });
  } catch (err) { next(err); }
};

const markRead = async (req, res, next) => {
  try {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, recipientUser: req.user._id }, { read: true }, { new: true });
    if (!n) return fail(res, 404, "Notification not found", "NOT_FOUND");
    res.json({ success: true, data: format(n) });
  } catch (err) { next(err); }
};

const markAllRead = async (req, res, next) => {
  try {
    const r = await Notification.updateMany({ recipientUser: req.user._id, channel: "in_app", read: false }, { read: true });
    res.json({ success: true, data: { updated: r.modifiedCount } });
  } catch (err) { next(err); }
};

const prefsOf = (u) => ({
  email: u.notificationPrefs?.email !== false,
  sms: u.notificationPrefs?.sms !== false,
  push: u.notificationPrefs?.push !== false,
  phone: u.phone || null,
});

const getPreferences = async (req, res) => res.json({ success: true, data: prefsOf(req.user) });

const updatePreferences = async (req, res, next) => {
  try {
    const { email, sms, push, phone } = req.body || {};
    const user = await User.findById(req.user._id);
    for (const [k, v] of Object.entries({ email, sms, push })) {
      if (v === undefined) continue;
      if (typeof v !== "boolean") return fail(res, 400, `${k} must be true or false`);
      user.notificationPrefs = { ...(user.notificationPrefs?.toObject?.() || user.notificationPrefs || {}), [k]: v };
    }
    if (phone !== undefined) {
      if (phone === null || phone === "") user.phone = null;
      else if (typeof phone === "string" && E164.test(phone.replace(/[\s-]/g, ""))) user.phone = phone.replace(/[\s-]/g, "");
      else return fail(res, 400, "Phone must be in international format, e.g. +919876543210");
    }
    await user.save();
    res.json({ success: true, data: prefsOf(user) });
  } catch (err) { next(err); }
};

// GET /notifications/log (admin) — delivery log across all users and channels
const log = async (req, res, next) => {
  try {
    const limit = Math.min(300, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const filter = { channel: { $ne: "in_app" } };
    if (req.query.channel && ["email", "sms", "push", "in_app"].includes(req.query.channel)) filter.channel = req.query.channel;
    if (req.query.status) filter.status = req.query.status;

    const [rows, counts] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).populate("recipientUser", "name").lean(),
      Notification.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    ]);
    const summary = { pending: 0, sent: 0, delivered: 0, failed: 0, skipped: 0 };
    for (const c of counts) summary[c._id] = c.n;

    res.json({
      success: true,
      data: rows.map((n) => ({
        _id: n._id, publicId: n.publicId, channel: n.channel, to: n.to, subject: n.subject, status: n.status,
        attempts: n.attempts, lastError: n.lastError, provider: n.provider, incidentId: n.incidentPublicId,
        recipientName: n.recipientUser ? n.recipientUser.name : null, createdAt: n.createdAt, sentAt: n.sentAt,
      })),
      summary,
    });
  } catch (err) { next(err); }
};

// POST /notifications/test (admin) — sends to the admin's own account
const test = async (req, res, next) => {
  try {
    const channel = req.body && req.body.channel;
    if (!["email", "sms", "in_app"].includes(channel)) return fail(res, 400, "channel must be email, sms or in_app");
    const user = await User.findById(req.user._id);
    const created = await notifyUsers([user], {
      type: "system",
      title: "Test notification",
      body: "This is a test message from the PS-9 Emergency Platform.",
      channels: [channel],
    });
    const n = created[0];
    if (!n) return fail(res, 400, `Could not send ${channel}: check your notification preferences`);
    res.json({ success: true, data: { status: n.status, provider: n.provider, error: n.lastError } });
  } catch (err) { next(err); }
};

module.exports = { list, markRead, markAllRead, getPreferences, updatePreferences, log, test };
