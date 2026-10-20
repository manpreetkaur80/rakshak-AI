import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { incidentAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/common/AppLayout";
import SeverityBadge from "../components/common/SeverityBadge";
import StatusBadge from "../components/common/StatusBadge";
import LiveMap from "../components/map/LiveMap";
import { formatTimeAgo, formatDateTime, TYPE_ICONS, RESOURCE_ICONS, getErrorMessage } from "../utils/helpers";
import { useToast } from "../components/common/Toast";
import { CheckCircle, ArrowRight, RefreshCw } from "lucide-react";

export default function Responder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [incidents, setIncidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [resolveNote, setResolveNote] = useState("");

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const res = await incidentAPI.list({ limit: 50 });
      const activeAssigned = (res.data.data || []).filter(
        (i) => !["RESOLVED", "CLOSED", "MERGED"].includes(i.status)
      );
      setIncidents(activeAssigned);
      if (activeAssigned.length > 0 && !selected) setSelected(activeAssigned[0]);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedDetail = async (publicId) => {
    try {
      const res = await incidentAPI.get(publicId);
      setSelected(res.data.data);
    } catch {}
  };

  useEffect(() => { loadIncidents(); }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on("incident:updated", (data) => {
      setIncidents((prev) => prev.map((i) => i.publicId === data.publicId ? { ...i, ...data } : i));
      if (selected?.publicId === data.publicId) setSelected((prev) => ({ ...prev, ...data }));
    });
    socket.on("incident:assigned", (data) => {
      loadIncidents();
      addToast(`New assignment: ${data.incidentId}`, "info");
    });
    return () => { socket.off("incident:updated"); socket.off("incident:assigned"); };
  }, [selected?.publicId]);

  const doAction = async (action, fn, msg) => {
    setActionLoading(action);
    try {
      await fn();
      addToast(msg, "success");
      if (selected) await loadSelectedDetail(selected.publicId);
      await loadIncidents();
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setActionLoading("");
    }
  };

  const handleStatusChange = (status) =>
    doAction(status, () => incidentAPI.updateStatus(selected.publicId, { status, note: `Responder status: ${status}` }), `Status → ${status}`);

  const handleResolve = () =>
    doAction("resolve", () => incidentAPI.resolve(selected.publicId, { note: resolveNote || "Resolved by responder" }), "Incident resolved");

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Responder Dashboard</h1>
          <p className="page-subtitle">Welcome, {user?.name} — {incidents.length} active incidents</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadIncidents}><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner spinner-lg" /></div>
      ) : incidents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No active assignments</div>
          <div className="empty-state-desc">You have no active incidents assigned</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, height: "calc(100vh - 180px)" }}>
          {/* Incident list */}
          <div className="card" style={{ padding: "14px 0", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "0 14px 10px", fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
              Active Incidents
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {incidents.map((inc) => (
                <div
                  key={inc._id || inc.publicId}
                  onClick={() => { setSelected(inc); loadSelectedDetail(inc.publicId); }}
                  style={{
                    padding: "12px 14px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    background: selected?.publicId === inc.publicId ? "var(--accent-light)" : "transparent",
                    borderLeft: selected?.publicId === inc.publicId ? "3px solid var(--accent)" : "3px solid transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                      {TYPE_ICONS[inc.type]} {inc.publicId}
                    </span>
                    <SeverityBadge severity={inc.severity} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inc.title}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <StatusBadge status={inc.status} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatTimeAgo(inc.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selected ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
              {/* Incident header */}
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: "monospace", color: "var(--accent)", fontWeight: 700 }}>{selected.publicId}</span>
                      <SeverityBadge severity={selected.severity} />
                      <span className={`badge badge-${(selected.priority || "P3").toLowerCase()}`}>{selected.priority}</span>
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{selected.title}</h2>
                    <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{selected.address}</p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>
                <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 12 }}>{selected.description}</p>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selected.status === "ASSIGNED" && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleStatusChange("EN_ROUTE")}
                      disabled={!!actionLoading}
                    >
                      <ArrowRight size={14} /> {actionLoading === "EN_ROUTE" ? "Updating..." : "Start Response — EN ROUTE"}
                    </button>
                  )}
                  {selected.status === "EN_ROUTE" && (
                    <button
                      className="btn btn-warning"
                      onClick={() => handleStatusChange("ON_SCENE")}
                      disabled={!!actionLoading}
                    >
                      <CheckCircle size={14} /> {actionLoading === "ON_SCENE" ? "Updating..." : "Arrived — ON SCENE"}
                    </button>
                  )}
                  {["ON_SCENE", "ASSIGNED", "EN_ROUTE"].includes(selected.status) && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 200 }}>
                      <input
                        className="form-input"
                        placeholder="Resolution note (optional)..."
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        style={{ flex: 1, fontSize: 12, padding: "7px 10px" }}
                      />
                      <button
                        className="btn btn-success"
                        onClick={handleResolve}
                        disabled={!!actionLoading}
                      >
                        <CheckCircle size={14} /> {actionLoading === "resolve" ? "Resolving..." : "Resolve"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Map + Timeline */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 12, flex: 1, overflow: "hidden" }}>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {selected.location?.coordinates ? (
                    <LiveMap incidents={[selected]} resources={[]} selectedIncident={selected} height="100%" />
                  ) : (
                    <div className="empty-state">Location not available</div>
                  )}
                </div>

                <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Timeline</div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    <div className="timeline">
                      {[...(selected.timeline || [])].reverse().map((evt, i) => (
                        <div key={i} className="timeline-item">
                          <div className="timeline-time">{formatDateTime(evt.timestamp)}</div>
                          <div className="timeline-message" style={{ fontSize: 12 }}>{evt.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state"><div className="empty-state-desc">Select an incident</div></div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
