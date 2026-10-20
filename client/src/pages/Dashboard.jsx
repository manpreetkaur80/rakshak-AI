import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { incidentAPI, analyticsAPI, alertAPI, resourceAPI } from "../services/api";
import { getSocket } from "../services/socket";
import AppLayout from "../components/common/AppLayout";
import SeverityBadge from "../components/common/SeverityBadge";
import StatusBadge from "../components/common/StatusBadge";
import LiveMap from "../components/map/LiveMap";
import { formatTimeAgo, getErrorMessage, TYPE_ICONS, RESOURCE_ICONS } from "../utils/helpers";
import { AlertTriangle, Clock, Truck, Activity, Bell, CheckCircle, RefreshCw } from "lucide-react";

export default function Dashboard() {
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [resources, setResources] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [liveLog, setLiveLog] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [incRes, resRes, altRes, ovRes] = await Promise.all([
        incidentAPI.list({ limit: 20 }),
        resourceAPI.list(),
        alertAPI.list({ acknowledged: false }),
        analyticsAPI.overview(),
      ]);
      setIncidents(incRes.data.data || []);
      setResources(resRes.data.data || []);
      setAlerts((altRes.data.data || []).slice(0, 10));
      setOverview(ovRes.data.data || {});
    } catch (err) {
      console.error("Dashboard load error:", getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Socket.IO real-time updates
  useEffect(() => {
    const socket = getSocket();

    const addLog = (msg) =>
      setLiveLog((prev) => [{ msg, ts: new Date() }, ...prev].slice(0, 8));

    socket.on("incident:created", (data) => {
      setIncidents((prev) => [data, ...prev.slice(0, 19)]);
      setOverview((prev) => prev ? { ...prev, activeIncidents: (prev.activeIncidents || 0) + 1 } : prev);
      addLog(`New incident: ${data.publicId} — ${data.type} (${data.severity})`);
    });

    socket.on("incident:updated", (data) => {
      setIncidents((prev) =>
        prev.map((inc) => inc.publicId === data.publicId ? { ...inc, ...data } : inc)
      );
      addLog(`Updated: ${data.publicId} → ${data.status || "updated"}`);
    });

    socket.on("incident:resolved", (data) => {
      setIncidents((prev) =>
        prev.map((inc) => inc.publicId === data.incidentId ? { ...inc, status: "RESOLVED" } : inc)
      );
      setOverview((prev) => prev ? {
        ...prev,
        activeIncidents: Math.max(0, (prev.activeIncidents || 0) - 1),
        resolvedToday: (prev.resolvedToday || 0) + 1,
      } : prev);
      addLog(`Resolved: ${data.incidentId}`);
    });

    socket.on("resource:updated", (data) => {
      setResources((prev) =>
        prev.map((r) => r.publicId === data.resourceId ? { ...r, status: data.status } : r)
      );
    });

    socket.on("alert:created", (data) => {
      setAlerts((prev) => [data, ...prev].slice(0, 10));
      setOverview((prev) => prev ? { ...prev, pendingAlerts: (prev.pendingAlerts || 0) + 1 } : prev);
      addLog(`🚨 Alert: ${data.title || data.message}`);
    });

    socket.on("demo:step", (data) => {
      addLog(`[DEMO] ${data.message}`);
    });

    return () => {
      socket.off("incident:created");
      socket.off("incident:updated");
      socket.off("incident:resolved");
      socket.off("resource:updated");
      socket.off("alert:created");
      socket.off("demo:step");
    };
  }, []);

  const activeIncidents = incidents.filter((i) =>
    !["RESOLVED", "CLOSED", "MERGED"].includes(i.status)
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="loading-center"><div className="spinner spinner-lg" /><span>Loading dashboard...</span></div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Command Dashboard</h1>
          <p className="page-subtitle">Real-time emergency operations overview</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadData}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card kpi-card-accent">
          <div className="kpi-label">Active Incidents</div>
          <div className="kpi-value">{overview?.activeIncidents ?? activeIncidents.length}</div>
          <div className="kpi-sub">Current emergencies</div>
        </div>
        <div className="kpi-card kpi-card-danger">
          <div className="kpi-label">Critical</div>
          <div className="kpi-value" style={{ color: "var(--critical)" }}>{overview?.criticalIncidents ?? 0}</div>
          <div className="kpi-sub">P1 / Critical severity</div>
        </div>
        <div className="kpi-card kpi-card-warning">
          <div className="kpi-label">Deployed</div>
          <div className="kpi-value" style={{ color: "var(--warning)" }}>{overview?.resourcesDeployed ?? 0}</div>
          <div className="kpi-sub">Resources on duty</div>
        </div>
        <div className="kpi-card kpi-card-accent">
          <div className="kpi-label">Avg Response</div>
          <div className="kpi-value">{overview?.averageResponseTimeMinutes ?? "—"}</div>
          <div className="kpi-sub">Minutes to on-scene</div>
        </div>
        <div className="kpi-card kpi-card-danger">
          <div className="kpi-label">Pending Alerts</div>
          <div className="kpi-value" style={{ color: "var(--danger)" }}>{overview?.pendingAlerts ?? alerts.length}</div>
          <div className="kpi-sub">Unacknowledged</div>
        </div>
        <div className="kpi-card kpi-card-success">
          <div className="kpi-label">Resolved Today</div>
          <div className="kpi-value" style={{ color: "var(--success)" }}>{overview?.resolvedToday ?? 0}</div>
          <div className="kpi-sub">Completed today</div>
        </div>
      </div>

      {/* Main 3-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 260px", gap: 16, height: "calc(100vh - 260px)", minHeight: 480 }}>
        {/* Incident list */}
        <div className="card" style={{ padding: "14px 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <span className="card-title"><AlertTriangle size={14} /> Incidents</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/incidents")}>All</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {activeIncidents.length === 0 ? (
              <div className="empty-state" style={{ padding: "24px" }}>
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-title">No active incidents</div>
              </div>
            ) : (
              activeIncidents.map((inc) => (
                <div
                  key={inc._id || inc.publicId}
                  onClick={() => { setSelectedIncident(inc); navigate(`/incidents/${inc.publicId}`); }}
                  style={{
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    background: selectedIncident?.publicId === inc.publicId ? "var(--accent-light)" : "transparent",
                  }}
                  onMouseEnter={(e) => { if (selectedIncident?.publicId !== inc.publicId) e.currentTarget.style.background = "var(--bg-card-hover)"; }}
                  onMouseLeave={(e) => { if (selectedIncident?.publicId !== inc.publicId) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                      {TYPE_ICONS[inc.type]} {inc.publicId}
                    </span>
                    <SeverityBadge severity={inc.severity} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inc.title || inc.description?.substring(0, 60)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <StatusBadge status={inc.status} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatTimeAgo(inc.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Map */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <LiveMap
            incidents={incidents}
            resources={resources}
            selectedIncident={selectedIncident}
            height="100%"
            onIncidentClick={(inc) => { setSelectedIncident(inc); navigate(`/incidents/${inc.publicId}`); }}
            onResourceClick={(res) => navigate(`/resources`)}
          />
        </div>

        {/* Right panel: resources + alerts */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
          {/* Resources */}
          <div className="card" style={{ padding: "14px 0", flex: "0 0 auto", maxHeight: "45%" }}>
            <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="card-title"><Truck size={14} /> Resources</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/resources")}>All</button>
            </div>
            <div style={{ overflowY: "auto", maxHeight: "calc(100% - 40px)" }}>
              {resources.slice(0, 12).map((res) => (
                <div key={res._id || res.publicId} style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{RESOURCE_ICONS[res.type]}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{res.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{res.publicId}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase",
                    background: res.status === "available" ? "#052e16" : res.status === "on_scene" ? "#450a0a" : "#1e3a5f",
                    color: res.status === "available" ? "#86efac" : res.status === "on_scene" ? "#fca5a5" : "#93c5fd",
                  }}>
                    {res.status === "en_route" ? "En Route" : res.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alert feed + live log */}
          <div className="card" style={{ padding: "14px 0", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "0 14px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span className="card-title"><Bell size={14} /> Alerts</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate("/alerts")}>All</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {alerts.length === 0 && liveLog.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px" }}>
                  <div className="empty-state-icon">✅</div>
                  <div style={{ fontSize: 12 }}>No active alerts</div>
                </div>
              ) : null}
              {alerts.map((al) => (
                <div key={al._id || al.publicId} style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `3px solid ${al.severity === "critical" ? "var(--danger)" : al.severity === "warning" ? "var(--warning)" : "var(--accent)"}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: al.severity === "critical" ? "#fca5a5" : al.severity === "warning" ? "#fcd34d" : "var(--text-primary)", marginBottom: 2 }}>
                    {al.severity === "critical" ? "🚨" : "⚠️"} {al.title}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{al.message?.substring(0, 80)}</div>
                </div>
              ))}
              {liveLog.length > 0 && (
                <div style={{ padding: "8px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Live Feed</div>
                  {liveLog.map((entry, i) => (
                    <div key={i} style={{ fontSize: 11, color: "var(--text-secondary)", padding: "3px 0", borderBottom: "1px solid #1e293b" }}>
                      <span style={{ color: "var(--text-muted)", marginRight: 6 }}>{entry.ts.toLocaleTimeString()}</span>
                      {entry.msg}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
