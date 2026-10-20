/**
 * Socket.IO event handler
 */

function initSockets(io) {
  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Client submitting an incident (lightweight — REST does the actual work)
    socket.on("incident:submit", (data) => {
      console.log("incident:submit via socket:", data);
      // Real work is done via REST; this is just an optional client event
    });

    // Resource status update (lightweight)
    socket.on("resource:status", (data) => {
      // Broadcast resource status change
      socket.broadcast.emit("resource:updated", data);
    });

    // Incident status update
    socket.on("incident:status", (data) => {
      socket.broadcast.emit("incident:updated", data);
    });

    // Alert acknowledge
    socket.on("alert:acknowledge", (data) => {
      socket.broadcast.emit("alert:updated", { ...data, acknowledged: true });
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err.message);
    });
  });
}

module.exports = { initSockets };
