import { io } from "socket.io-client";

const SOCKET_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") || "/";

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      autoConnect: false,
      // Evaluated on every (re)connect so the latest token is always sent.
      auth: (cb) => cb({ token: localStorage.getItem("ps9_token") || null }),
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected && !s.active) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
}

// Used after login/logout so the server sees the fresh (or absent) token.
// Registered listeners are kept — they belong to the same socket object.
export function reconnectSocket() {
  const s = getSocket();
  s.disconnect();
  s.connect();
  return s;
}

export default getSocket;
