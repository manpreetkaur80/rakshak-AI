const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

function generateToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// POST /api/v1/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, role = "citizen" } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required", code: "VALIDATION_ERROR" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters", code: "VALIDATION_ERROR" });
    }

    // Only citizen self-registration; admin/operator/responder via seed
    const allowedPublicRoles = ["citizen"];
    const finalRole = allowedPublicRoles.includes(role) ? role : "citizen";

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Email already registered", code: "VALIDATION_ERROR" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role: finalRole });

    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: { id: user._id, publicId: user.publicId, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required", code: "VALIDATION_ERROR" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid credentials", code: "INVALID_CREDENTIALS" });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        token,
        user: { id: user._id, publicId: user.publicId, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/auth/me
const getMe = async (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user._id,
      publicId: req.user.publicId,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
};

module.exports = { register, login, getMe };
