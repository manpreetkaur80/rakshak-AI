import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck } from "lucide-react";
import { notificationAPI } from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "./Toast";
import { formatTimeAgo } from "../../utils/helpers";

const desktopSupported = () => typeof window !== "undefined" && "Notification" in window;

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState(desktopSupported() ? Notification.permission : "denied");
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await notificationAPI.list({ limit: 20 });
      setItems(res.data.data || []);
      setUnread(res.data.meta?.unread ?? (res.data.data || []).filter((n) => !n.read).length);
    } catch {
      // Endpoint unavailable for this role → bell simply stays empty
    }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  // Live notifications
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onNew = (n) => {
      setItems((prev) => (prev.some((x) => x._id === n._id) ? prev : [{ ...n, read: false }, ...prev].slice(0, 30)));
      setUnread((c) => c + 1);
      addToast(n.title || n.body || "New notification", "info", 6000);
      if (desktopSupported() && Notification.permission === "granted") {
        try { new Notification(n.title || "RakshakAI", { body: n.body || "" }); } catch { /* some browsers block constructor use */ }
      }
    };
    socket.on("notification:new", onNew);
    return () => { socket.off("notification:new", onNew); };
  }, [user, addToast]);

  // Close when clicking outside the panel
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openNotification = async (n) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((c) => Math.max(0, c - 1));
      notificationAPI.markRead(n._id).catch(() => {});
    }
    if (n.incidentId) {
      setOpen(false);
      navigate(user?.role === "citizen" ? `/track?id=${n.incidentId}` : `/incidents/${n.incidentId}`);
    }
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    try { await notificationAPI.markAllRead(); } catch { load(); }
  };

  const enableDesktop = async () => {
    if (!desktopSupported()) return;
    try { setPermission(await Notification.requestPermission()); } catch { /* ignore */ }
  };

  if (!user) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        className="btn btn-ghost btn-sm btn-icon"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        title="Notifications"
        aria-label="Notifications"
        style={{ position: "relative" }}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, padding: "0 4px",
            borderRadius: 8, background: "var(--danger)", color: "#fff", fontSize: 10, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "fixed", top: 12, left: "calc(var(--sidebar-width) + 8px)", width: 360, maxWidth: "92vw",
            ...(window.matchMedia && window.matchMedia("(max-width: 900px)").matches ? { left: 8, right: 8, top: 56, width: "auto", maxWidth: "none" } : {}),
            maxHeight: "70vh", display: "flex", flexDirection: "column", padding: 0, zIndex: 1000,
            boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <span className="card-title"><Bell size={14} /> Notifications {unread > 0 && `(${unread})`}</span>
            <button className="btn btn-ghost btn-sm" onClick={markAll} disabled={unread === 0}>
              <CheckCheck size={13} /> Mark all read
            </button>
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {items.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-state-icon">🔔</div>
                <div className="empty-state-desc">No notifications yet</div>
              </div>
            ) : (
              items.map((n) => (
                <div
                  key={n._id}
                  onClick={() => openNotification(n)}
                  style={{
                    padding: "10px 14px", borderBottom: "1px solid var(--border)",
                    cursor: n.incidentId || !n.read ? "pointer" : "default",
                    background: n.read ? "transparent" : "var(--accent-light)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: n.read ? 500 : 700, color: "var(--text-primary)" }}>
                      {!n.read && <span style={{ color: "var(--accent)", marginRight: 6 }}>●</span>}
                      {n.title || "Notification"}
                    </span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatTimeAgo(n.createdAt)}</span>
                  </div>
                  {n.body && <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{n.body}</div>}
                  {n.incidentId && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 3 }}>{n.incidentId} →</div>}
                </div>
              ))
            )}
          </div>

          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {desktopSupported() && permission === "default" ? (
              <button className="btn btn-ghost btn-sm" onClick={enableDesktop}>Enable desktop alerts</button>
            ) : (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {desktopSupported() ? (permission === "granted" ? "Desktop alerts on" : "Desktop alerts blocked in browser") : "Desktop alerts not supported"}
              </span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); navigate("/settings/notifications"); }}>Settings</button>
          </div>
        </div>
      )}
    </div>
  );
}
