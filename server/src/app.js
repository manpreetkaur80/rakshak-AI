const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const errorHandler = require("./middleware/errorHandler");

const authRoutes = require("./routes/auth.routes");
const incidentRoutes = require("./routes/incident.routes");
const resourceRoutes = require("./routes/resource.routes");
const alertRoutes = require("./routes/alert.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const demoRoutes = require("./routes/demo.routes");

const app = express();

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false, // Allow Leaflet map tiles
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many requests", code: "RATE_LIMIT" },
});

const incidentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  message: { success: false, message: "Too many incident reports", code: "RATE_LIMIT" },
});

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const mongoose = require("mongoose");
  const dbState = mongoose.connection.readyState;
  const dbStatus = dbState === 1 ? "connected" : "disconnected";
  const status = dbState === 1 ? "ok" : "degraded";

  res.status(dbState === 1 ? 200 : 503).json({
    status,
    database: dbStatus,
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/v1/auth", authLimiter, authRoutes);
app.use("/api/v1/incidents", incidentLimiter, incidentRoutes);
app.use("/api/v1/resources", resourceRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/demo", demoRoutes);

// Legacy redirect
app.get("/api/incidents", (req, res) => res.redirect("/api/v1/incidents"));

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found", code: "NOT_FOUND" });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
