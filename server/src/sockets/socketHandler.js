/**
 * Socket.IO setup.
 *
 *  - Clients authenticate with their JWT in the handshake (`auth: { token }`).
 *  - Staff roles (operator, admin, responder, hospital) join the "staff" room and receive full events.
 *  - Everyone else (anonymous visitors on the /track page, citizens) joins "public" and only receives
 *    a minimal status payload for incident updates — never descriptions, reporter data or resources.
 *  - Clients can NOT push events to other clients: the old handlers re-broadcast whatever any
 *    (unauthenticated) client sent, which allowed spoofing of live incident/resource updates.
 *    All state changes go through the authenticated REST API.
 */
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const STAFF_ROLES = ["operator", "admin", "responder", "hospital"];

/** Reduce a full server event to what a public (non-staff) client may see, or null to drop it. */
function toPublicPayload(event, data) {
  if (!data) return null;
  if (event === "incident:updated" && data.publicId && data.status) {
    return { publicId: data.publicId, status: data.status, updatedAt: data.updatedAt || new Date() };
  }
  if (event === "incident:resolved") {
    const id = data.incidentId || data.publicId;
    return id ? { publicId: id, incidentId: id, status: "RESOLVED", resolvedAt: data.resolvedAt, updatedAt: data.resolvedAt || new Date() } : null;
  }
  return null;
}

/** Wrapper handed to controllers/services in place of the raw `io`. Same `.emit(event, data)` API. */
function createRealtime(io) {
  return {
    emit(event, data) {
      io.to("staff").emit(event, data);
      const pub = toPublicPayload(event, data);
      if (pub) io.to("public").emit(event, pub);
    },
    /** Private message to one signed-in user (all of their open tabs). */
    emitToUser(userId, event, data) {
      io.to(`user:${userId}`).emit(event, data);
    },
  };
}

function initSockets(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (token && process.env.JWT_SECRET) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("role isActive name").lean();
        if (user && user.isActive) socket.data.user = { id: String(user._id), role: user.role, name: user.name };
      }
    } catch {
      // Invalid/expired token → treat as anonymous (public room) rather than refusing the connection
    }
    next();
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    socket.join(user && STAFF_ROLES.includes(user.role) ? "staff" : "public");
    if (user) socket.join(`user:${user.id}`);

    socket.on("disconnect", () => {});
    socket.on("error", (err) => console.error("Socket error:", err.message));
  });
}

module.exports = { initSockets, createRealtime, toPublicPayload, STAFF_ROLES };
