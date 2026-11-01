const bcrypt = require("bcryptjs");
const User = require("../models/User");
const config = require("../services/config.service");

const ROLES = ["citizen", "responder", "operator", "admin", "hospital"];
const fail = (res, status, message, code = "VALIDATION_ERROR") => res.status(status).json({ success: false, message, code });

const getConfig = (req, res) => res.json({ success: true, data: config.getConfig() });

const updateConfig = async (req, res, next) => {
  try {
    const { escalation, duplicate, autoDispatch } = req.body || {};
    const data = await config.update({ escalation, duplicate, autoDispatch });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-passwordHash").sort({ role: 1, name: 1 }).lean();
    res.json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body || {};
    if (!name || !email || !password) return fail(res, 400, "Name, email and password are required");
    if (typeof password !== "string" || password.length < 8) return fail(res, 400, "Password must be at least 8 characters");
    if (!ROLES.includes(role)) return fail(res, 400, `Role must be one of: ${ROLES.join(", ")}`);
    if (await User.findOne({ email: String(email).toLowerCase() })) return fail(res, 409, "Email already registered");

    let cleanPhone = null;
    if (phone) {
      cleanPhone = String(phone).replace(/[\s-]/g, "");
      if (!/^\+[1-9]\d{7,14}$/.test(cleanPhone)) return fail(res, 400, "Phone must be in international format, e.g. +919876543210");
    }
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role, phone: cleanPhone });
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { role, isActive } = req.body || {};
    const user = await User.findById(req.params.id);
    if (!user) return fail(res, 404, "User not found", "NOT_FOUND");

    const self = String(user._id) === String(req.user._id);
    if (role !== undefined) {
      if (!ROLES.includes(role)) return fail(res, 400, `Role must be one of: ${ROLES.join(", ")}`);
      if (self && role !== user.role) return fail(res, 400, "You cannot change your own role");
      user.role = role;
    }
    if (isActive !== undefined) {
      if (typeof isActive !== "boolean") return fail(res, 400, "isActive must be true or false");
      if (self && !isActive) return fail(res, 400, "You cannot deactivate your own account");
      user.isActive = isActive;
    }
    await user.save();
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

module.exports = { getConfig, updateConfig, listUsers, createUser, updateUser };
