require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const { initSockets } = require("./src/sockets/socketHandler");
const { startEscalationCron, setIO: setEscalationIO } = require("./src/services/escalation.service");
const incidentCtrl = require("./src/controllers/incident.controller");
const resourceCtrl = require("./src/controllers/resource.controller");
const alertCtrl = require("./src/controllers/alert.controller");
const demoCtrl = require("./src/controllers/demo.controller");

const PORT = process.env.PORT || 5000;

async function start() {
  // Connect to MongoDB
  await connectDB();

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

  // Wire IO to controllers/services
  initSockets(io);
  incidentCtrl.setIO(io);
  resourceCtrl.setIO(io);
  alertCtrl.setIO(io);
  demoCtrl.setIO(io);
  setEscalationIO(io);

  // Start escalation cron
  startEscalationCron();

  // Start listening
  server.listen(PORT, () => {
    console.log(`\n🚀 PS-9 Emergency Server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API:    http://localhost:${PORT}/api/v1`);
    console.log(`   Client: ${process.env.CLIENT_URL || "http://localhost:5173"}\n`);
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down gracefully");
    server.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
