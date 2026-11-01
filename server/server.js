require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { initSockets, createRealtime } = require("./src/sockets/socketHandler");
const config = require("./src/services/config.service");
const movement = require("./src/services/movement.service");
const notifications = require("./src/services/notification.service");
const incidentService = require("./src/services/incident.service");
const { startEscalationCron, setIO: setEscalationIO } = require("./src/services/escalation.service");
const incidentCtrl = require("./src/controllers/incident.controller");
const resourceCtrl = require("./src/controllers/resource.controller");
const alertCtrl = require("./src/controllers/alert.controller");
const demoCtrl = require("./src/controllers/demo.controller");

const PORT = process.env.PORT || 5000;

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error("JWT_SECRET must be set in .env (at least 16 characters)");
  }

  // Connect to MongoDB and load admin-editable settings (escalation thresholds, duplicate tuning)
  await connectDB();
  await config.load();

  // Create HTTP server
  const server = http.createServer(app);

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // Wire realtime to controllers/services (staff get full events, public clients get minimal ones)
  initSockets(io);
  const realtime = createRealtime(io);
  incidentCtrl.setIO(realtime);
  resourceCtrl.setIO(realtime);
  alertCtrl.setIO(realtime);
  demoCtrl.setIO(realtime);
  setEscalationIO(realtime);
  movement.setIO(realtime);
  notifications.setIO(realtime);
  incidentService.setIO(realtime);
  require("./src/services/dispatch.service").setIO(realtime);

  // Start escalation cron
  startEscalationCron();
  movement.startMovement();
  notifications.startNotificationCron();

  // Start listening
  server.listen(PORT, () => {
    console.log(`\n🚀 PS-9 Emergency Server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/v1`);
    console.log(`   Client: ${process.env.CLIENT_URL || "http://localhost:5173"}\n`);
  });

  // Graceful shutdown
  const shutdown = (signal) => () => {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown("SIGTERM"));
  process.on("SIGINT", shutdown("SIGINT"));
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
