import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { incidentAPI } from "../services/api";
import { getSocket, connectSocket } from "../services/socket";
import SeverityBadge from "../components/common/SeverityBadge";
import StatusBadge from "../components/common/StatusBadge";
import { formatDateTime, TYPE_ICONS, getErrorMessage } from "../utils/helpers";
import { Search } from "lucide-react";

const STATUS_STEPS = ["REPORTED", "CLASSIFIED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "RESOLVED"];

export default function TrackIncident() {
  const [searchParams] = useSearchParams();
  const [incidentId, setIncidentId] = useState(searchParams.get("id") || "");
  const [incident, setIncident] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const searchIncident = async (id) => {
    if (!id.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await incidentAPI.get(id.trim());
      setIncident(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
      setIncident(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    connectSocket();
    if (incidentId) searchIncident(incidentId);
  }, []);

  useEffect(() => {
    if (!incident) return;
    const socket = getSocket();
    // Anonymous sockets only receive minimal public events: {publicId, status, updatedAt}
    connectSocket();
    const onUpdated = (data) => {
      if (data.publicId !== incident.publicId) return;
      setIncident((prev) => ({
        ...prev,
        ...(data.status ? { status: data.status } : {}),
        ...(data.updatedAt ? { updatedAt: data.updatedAt } : {}),
      }));
    };
    const onResolved = (data) => {
      const pid = data.publicId || data.incidentId;
      if (pid === incident.publicId) setIncident((prev) => ({ ...prev, status: "RESOLVED" }));
    };
    socket.on("incident:updated", onUpdated);
    socket.on("incident:resolved", onResolved);
    return () => { socket.off("incident:updated", onUpdated); socket.off("incident:resolved", onResolved); };
  }, [incident?.publicId]);

  // DUPLICATE_CANDIDATE is an internal review state; to the reporter it is still "classified".
  const publicStatus = incident?.status === "DUPLICATE_CANDIDATE" ? "CLASSIFIED" : incident?.status === "CLOSED" ? "RESOLVED" : incident?.status;
  const currentStepIndex = STATUS_STEPS.indexOf(publicStatus);

  return (
    <div className="track-page" style={{ minHeight: "100vh", background: "var(--bg-primary)", padding: 32 }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🛡️</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>Track Your Incident</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Enter your incident ID to check the current status</p>
        </div>

        {/* Search */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              className="form-input"
              placeholder="Enter incident ID (e.g. INC-10024)"
              value={incidentId}
              onChange={(e) => setIncidentId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchIncident(incidentId)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={() => searchIncident(incidentId)}
              disabled={loading || !incidentId.trim()}
            >
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Search size={16} />}
            </button>
          </div>
        </div>

        {error && <div className="alert-strip error" style={{ marginBottom: 16 }}>❌ {error}</div>}

        {incident && (
          <>
            {/* Status header */}
            <div className="card" style={{ marginBottom: 16, borderLeft: `3px solid ${incident.severity === "critical" ? "var(--danger)" : incident.severity === "high" ? "var(--high)" : "var(--accent)"}` }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 20 }}>{TYPE_ICONS[incident.type]}</span>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)" }}>{incident.publicId}</span>
                                      </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>{incident.title}</h2>
                  <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{incident.address}</p>
                </div>
                <div style={{ textAlign: "right", display: "flex", flexDirection: "column", gap: 6 }}>
                  {incident.severity && <SeverityBadge severity={incident.severity} />}
                  {incident.priority && <span className={`badge badge-${incident.priority.toLowerCase()}`}>{incident.priority}</span>}
                </div>
              </div>
              <StatusBadge status={incident.status} />
              {incident.status === "MERGED" && (
                <p style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
                  This report was combined with another report of the same emergency. Responders are working on it.
                </p>
              )}
            </div>

            {/* Progress tracker */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header"><span className="card-title">Response Progress</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", paddingBottom: 4 }}>
                {STATUS_STEPS.map((step, i) => {
                  const done = currentStepIndex >= i;
                  const current = currentStepIndex === i;
                  return (
                    <div key={step} style={{ display: "flex", alignItems: "center", flex: i < STATUS_STEPS.length - 1 ? 1 : "none" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 80 }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: done ? (current ? "var(--accent)" : "var(--success)") : "var(--border)",
                          border: current ? "2px solid var(--accent)" : "none",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, color: done ? "#fff" : "var(--text-muted)",
                          fontWeight: 700,
                          boxShadow: current ? "0 0 0 3px #3b82f620" : "none",
                        }}>
                          {done && !current ? "✓" : i + 1}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 4, color: done ? "var(--text-primary)" : "var(--text-muted)", fontWeight: current ? 700 : 400, whiteSpace: "nowrap" }}>
                          {step.replace("_", " ")}
                        </div>
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div style={{ flex: 1, height: 2, background: currentStepIndex > i ? "var(--success)" : "var(--border)", margin: "0 4px", marginBottom: 20, minWidth: 20 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Assessment */}
            {incident.aiClassification && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-header">
                  <span className="card-title">
                    {incident.aiClassification.isFallback ? "⚙️ Automated Assessment" : "🤖 AI Assessment"}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {Math.round((incident.aiClassification.confidence || 0) * 100)}% confidence
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                  {incident.aiClassification.summary}
                </p>
              </div>
            )}

            {/* Timeline */}
            <div className="card">
              <div className="card-header"><span className="card-title">Timeline</span></div>
              {!incident.timeline || incident.timeline.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No events recorded yet</p>
              ) : (
                <div className="timeline">
                  {[...(incident.timeline || [])].reverse().map((evt, i) => (
                    <div key={i} className="timeline-item">
                      <div className="timeline-time">{formatDateTime(evt.timestamp)}</div>
                      <div className="timeline-message">{evt.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <a href="/report" style={{ color: "var(--accent)", fontSize: 13 }}>← Report a new emergency</a>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>
          ⚠️ This is a hackathon demo platform. Not for real emergency use.
        </div>
      </div>
    </div>
  );
}
