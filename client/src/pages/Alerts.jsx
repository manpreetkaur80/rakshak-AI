import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { alertAPI } from "../services/api";
import { getSocket } from "../services/socket";
import AppLayout from "../components/common/AppLayout";
import { formatTimeAgo, formatDateTime, getErrorMessage } from "../utils/helpers";
import { Bell, CheckCircle, RefreshCw } from "lucide-react";
import { useToast } from "../components/common/Toast";

export default function Alerts() {
  const addToast = useToast();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === "unack") params.acknowledged = false;
      if (filter === "critical") params.severity = "critical";
      if (filter === "warning") params.severity = "warning";
      const res = await alertAPI.list(params);
      setAlerts(res.data.data || []);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAlerts(); }, [filter]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("alert:created", (data) => {
      setAlerts((prev) => [{ ...data, isAcknowledged: false, createdAt: new Date() }, ...prev]);
    });
    socket.on("alert:updated", (data) => {
      setAlerts((prev) => prev.map((a) => (a._id === data.id || a.publicId === data.publicId) ? { ...a, isAcknowledged: data.acknowledged } : a));
    });
    return () => { socket.off("alert:created"); socket.off("alert:updated"); };
  }, []);

  const handleAcknowledge = async (alertId) => {
    try {
      await alertAPI.acknowledge(alertId);
      setAlerts((prev) => prev.map((a) => (a._id === alertId || a.publicId === alertId) ? { ...a, isAcknowledged: true } : a));
      addToast("Alert acknowledged", "success");
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    }
  };

  const unackCount = alerts.filter((a) => !a.isAcknowledged).length;

  const SEVERITY_STYLE = {
    critical: { border: "var(--danger)", bg: "#450a0a20", icon: "🚨", label: "#fca5a5" },
    warning: { border: "var(--warning)", bg: "#451a0320", icon: "⚠️", label: "#fcd34d" },
    info: { border: "var(--accent)", bg: "#1e3a5f20", icon: "ℹ️", label: "#93c5fd" },
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts</h1>
          <p className="page-subtitle">{unackCount} unacknowledged · {alerts.length} total</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={loadAlerts}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16, display: "flex", gap: 8 }}>
        {["", "unack", "critical", "warning"].map((f) => (
          <button
            key={f}
            className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilter(f)}
          >
            {f === "" ? "All" : f === "unack" ? `Unacknowledged (${unackCount})` : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner spinner-lg" /></div>
      ) : alerts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No alerts</div>
          <div className="empty-state-desc">All clear</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {alerts.map((alert) => {
            const style = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.info;
            return (
              <div
                key={alert._id || alert.publicId}
                className="card card-sm"
                style={{
                  borderLeft: `4px solid ${style.border}`,
                  background: alert.isAcknowledged ? "var(--bg-secondary)" : style.bg,
                  opacity: alert.isAcknowledged ? 0.7 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span>{style.icon}</span>
                      <span style={{ fontWeight: 700, fontSize: 14, color: style.label }}>{alert.title}</span>
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--bg-primary)", color: "var(--text-muted)", textTransform: "uppercase" }}>
                        {alert.severity}
                      </span>
                      {alert.isAcknowledged && (
                        <span style={{ fontSize: 10, color: "var(--success)" }}>✅ Acknowledged</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>{alert.message}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                      <span>{formatTimeAgo(alert.createdAt)}</span>
                      {alert.incidentId && (
                        <button
                          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, padding: 0 }}
                          onClick={() => navigate(`/incidents/${alert.incidentId?.publicId || alert.incidentId}`)}
                        >
                          View Incident →
                        </button>
                      )}
                    </div>
                  </div>
                  {!alert.isAcknowledged && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleAcknowledge(alert._id || alert.publicId)}
                      style={{ flexShrink: 0 }}
                    >
                      <CheckCircle size={13} /> Acknowledge
                    </button>
                  )}
                </div>
                {alert.isAcknowledged && alert.acknowledgedAt && (
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                    Acknowledged {formatDateTime(alert.acknowledgedAt)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
