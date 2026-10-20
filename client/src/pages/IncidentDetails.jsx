import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { incidentAPI, resourceAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/common/AppLayout";
import SeverityBadge from "../components/common/SeverityBadge";
import StatusBadge from "../components/common/StatusBadge";
import LiveMap from "../components/map/LiveMap";
import { formatDateTime, formatTimeAgo, TYPE_ICONS, RESOURCE_ICONS, getErrorMessage } from "../utils/helpers";
import { AlertTriangle, Zap, Merge, ArrowRight, CheckCircle, RefreshCw, Cpu } from "lucide-react";
import { useToast } from "../components/common/Toast";

export default function IncidentDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const addToast = useToast();

  const [incident, setIncident] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [resolveNote, setResolveNote] = useState("");
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [editSeverity, setEditSeverity] = useState("");
  const [editPriority, setEditPriority] = useState("");

  const canOperate = ["operator", "admin"].includes(user?.role);
  const canRespond = user?.role === "responder" || canOperate;

  const loadIncident = async () => {
    try {
      const res = await incidentAPI.get(id);
      const inc = res.data.data;
      setIncident(inc);
      setEditSeverity(inc.severity || "");
      setEditPriority(inc.priority || "");

      if (canOperate && !["RESOLVED", "CLOSED", "MERGED"].includes(inc.status)) {
        try {
          const recRes = await resourceAPI.recommendations(inc.publicId);
          setRecommendations(recRes.data.data || []);
        } catch {}
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadIncident(); }, [id]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("incident:updated", (data) => {
      if (data.publicId === incident?.publicId) setIncident((prev) => ({ ...prev, ...data }));
    });
    socket.on("incident:classified", (data) => {
      if (data.publicId === incident?.publicId) setIncident((prev) => ({ ...prev, ...data }));
    });
    return () => { socket.off("incident:updated"); socket.off("incident:classified"); };
  }, [incident?.publicId]);

  const doAction = async (action, fn, successMsg) => {
    setActionLoading(action);
    setError("");
    try {
      await fn();
      addToast(successMsg, "success");
      await loadIncident();
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      addToast(msg, "error");
    } finally {
      setActionLoading("");
    }
  };

  const handleClassify = () =>
    doAction("classify", () => incidentAPI.classify(incident.publicId), "Incident re-classified");

  const handleDispatch = (resourceId) =>
    doAction("dispatch", () => incidentAPI.assign(incident.publicId, { resourceIds: [resourceId] }), "Resource dispatched");

  const handleMerge = (sourceId) =>
    doAction("merge", () => incidentAPI.merge(incident.publicId, { sourceIncidentId: sourceId }), "Reports merged");

  const handleEscalate = () =>
    doAction("escalate", () => incidentAPI.escalate(incident.publicId, { reason: "Manual escalation by operator" }), "Incident escalated");

  const handleResolve = () => {
    setShowResolveModal(false);
    doAction("resolve", () => incidentAPI.resolve(incident.publicId, { note: resolveNote }), "Incident resolved");
  };

  const handleStatusUpdate = (status) =>
    doAction(status, () => incidentAPI.updateStatus(incident.publicId, { status }), `Status updated to ${status}`);

  const handleOverrideUpdate = () =>
    doAction("override", () => incidentAPI.update(incident.publicId, { severity: editSeverity, priority: editPriority }), "Incident updated");

  if (loading) return <AppLayout><div className="loading-center"><div className="spinner spinner-lg" /></div></AppLayout>;
  if (error && !incident) return <AppLayout><div className="alert-strip error">{error}</div></AppLayout>;
  if (!incident) return <AppLayout><div className="empty-state">Incident not found</div></AppLayout>;

  const isActive = !["RESOLVED", "CLOSED", "MERGED"].includes(incident.status);
  const ai = incident.aiClassification;
  const dupCandidates = (incident.duplicateCandidates || []).filter((d) => d.status === "pending");

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{TYPE_ICONS[incident.type]}</span>
            <span style={{ fontFamily: "monospace", color: "var(--accent)", fontWeight: 700 }}>{incident.publicId}</span>
            {incident.isDemo && <span className="tag" style={{ fontSize: 10, color: "var(--warning)", borderColor: "var(--warning)" }}>DEMO</span>}
            <SeverityBadge severity={incident.severity} />
            <span className={`badge badge-${(incident.priority || "P3").toLowerCase()}`}>{incident.priority}</span>
            <StatusBadge status={incident.status} />
          </div>
          <h1 className="page-title" style={{ fontSize: 18 }}>{incident.title}</h1>
          <p className="page-subtitle">{incident.address || "Location not specified"} · {formatTimeAgo(incident.createdAt)}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={loadIncident}><RefreshCw size={14} /></button>
      </div>

      {error && <div className="alert-strip error" style={{ marginBottom: 16 }}>❌ {error}</div>}

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Description */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Incident Description</span>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>{incident.description}</p>
            {incident.imageUrl && (
              <img src={incident.imageUrl} alt="Incident" style={{ marginTop: 12, maxWidth: "100%", borderRadius: 6, border: "1px solid var(--border)" }} />
            )}
          </div>

          {/* AI Classification */}
          {ai && (
            <div className="card" style={{ borderLeft: `3px solid ${ai.isFallback ? "var(--warning)" : "var(--accent)"}` }}>
              <div className="card-header">
                <span className="card-title">
                  <Cpu size={14} />
                  {ai.isFallback ? "Rule-Based Classification" : "AI Classification"}
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--text-muted)" }}>
                    ({ai.isFallback ? "Automated fallback" : "Gemini AI"})
                  </span>
                </span>
                <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>
                  {Math.round((ai.confidence || 0) * 100)}% confidence
                </span>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>{ai.summary}</div>
              </div>
              {ai.recommendedActions?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--text-muted)", marginBottom: 6 }}>Recommended Actions</div>
                  <ul style={{ paddingLeft: 16, color: "var(--text-secondary)", fontSize: 13 }}>
                    {ai.recommendedActions.map((a, i) => <li key={i} style={{ marginBottom: 4 }}>{a}</li>)}
                  </ul>
                </div>
              )}
              {ai.classifiedAt && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 10 }}>Classified {formatTimeAgo(ai.classifiedAt)}</div>}
            </div>
          )}

          {/* Duplicate candidates */}
          {dupCandidates.length > 0 && (
            <div className="card" style={{ borderLeft: "3px solid var(--warning)" }}>
              <div className="card-header">
                <span className="card-title">⚠️ Possible Duplicate Reports</span>
              </div>
              {dupCandidates.map((dup) => (
                <div key={dup._id} style={{ padding: "12px", background: "var(--warning-light)", borderRadius: 6, marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                      Matches: {dup.incidentId?.publicId || "Unknown"}
                    </span>
                    <span style={{ color: "var(--warning)", fontWeight: 700 }}>{Math.round(dup.score * 100)}% match</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>
                    <span>📍 Location: {Math.round(dup.locationScore * 100)}%</span>
                    <span>⏱ Time: {Math.round(dup.timeScore * 100)}%</span>
                    <span>📝 Text: {Math.round(dup.textScore * 100)}%</span>
                  </div>
                  {canOperate && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="btn btn-warning btn-sm"
                        onClick={() => handleMerge(dup.incidentId?.publicId)}
                        disabled={!!actionLoading}
                      >
                        <Merge size={12} /> Confirm & Merge
                      </button>
                      <button className="btn btn-ghost btn-sm" disabled={!!actionLoading}>
                        Keep Separate
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Map */}
          {incident.location?.coordinates && (
            <div className="card" style={{ padding: 0, overflow: "hidden", height: 280 }}>
              <LiveMap
                incidents={[incident]}
                resources={incident.assignedResources?.map((ar) => ar.resourceId).filter(Boolean) || []}
                selectedIncident={incident}
                height="280px"
              />
            </div>
          )}

          {/* Timeline */}
          <div className="card">
            <div className="card-header"><span className="card-title">Incident Timeline</span></div>
            {incident.timeline?.length === 0 ? (
              <div className="empty-state" style={{ padding: "16px" }}><div className="empty-state-desc">No timeline events yet</div></div>
            ) : (
              <div className="timeline">
                {[...(incident.timeline || [])].reverse().map((event, i) => (
                  <div key={i} className="timeline-item">
                    <div className="timeline-time">{formatDateTime(event.timestamp)}</div>
                    <div className="timeline-message">{event.message}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column — actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Actions */}
          {isActive && (
            <div className="card">
              <div className="card-header"><span className="card-title">Actions</span></div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {canOperate && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={handleClassify} disabled={!!actionLoading}>
                      <Cpu size={13} /> {actionLoading === "classify" ? "Classifying..." : "Re-Classify (AI)"}
                    </button>
                    <button className="btn btn-warning btn-sm" onClick={handleEscalate} disabled={!!actionLoading || incident.escalation?.isEscalated}>
                      <AlertTriangle size={13} /> {incident.escalation?.isEscalated ? "Escalated" : "Escalate Incident"}
                    </button>
                  </>
                )}
                {incident.status === "ASSIGNED" && canRespond && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleStatusUpdate("EN_ROUTE")} disabled={!!actionLoading}>
                    <ArrowRight size={13} /> {actionLoading === "EN_ROUTE" ? "Updating..." : "Mark EN ROUTE"}
                  </button>
                )}
                {incident.status === "EN_ROUTE" && canRespond && (
                  <button className="btn btn-success btn-sm" onClick={() => handleStatusUpdate("ON_SCENE")} disabled={!!actionLoading}>
                    <CheckCircle size={13} /> {actionLoading === "ON_SCENE" ? "Updating..." : "Mark ON SCENE"}
                  </button>
                )}
                {["ON_SCENE", "ASSIGNED", "EN_ROUTE", "CLASSIFIED", "REPORTED"].includes(incident.status) && canRespond && (
                  <button className="btn btn-success btn-sm" onClick={() => setShowResolveModal(true)} disabled={!!actionLoading}>
                    <CheckCircle size={13} /> Resolve Incident
                  </button>
                )}
              </div>

              {/* Operator overrides */}
              {canOperate && (
                <div style={{ marginTop: 16 }}>
                  <div className="divider" />
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Override Classification</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                    <select className="form-input" value={editSeverity} onChange={(e) => setEditSeverity(e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }}>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                    <select className="form-input" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={{ fontSize: 12, padding: "6px 8px" }}>
                      <option value="P1">P1</option>
                      <option value="P2">P2</option>
                      <option value="P3">P3</option>
                      <option value="P4">P4</option>
                    </select>
                  </div>
                  <button className="btn btn-ghost btn-sm btn-full" onClick={handleOverrideUpdate} disabled={!!actionLoading}>
                    Save Override
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Resource recommendations */}
          {canOperate && isActive && recommendations.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title"><Zap size={14} /> Recommended Resources</span></div>
              {recommendations.map((rec) => (
                <div key={rec.resourceId} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                      {RESOURCE_ICONS[rec.type]} {rec.name}
                    </span>
                    <span style={{ color: "var(--success)", fontSize: 12, fontWeight: 700 }}>{rec.matchScore}%</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
                    {rec.resourceId} · {rec.distanceKm} km · ETA ~{rec.etaMinutes} min
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDispatch(rec.resourceId)}
                    disabled={!!actionLoading || rec.status !== "available"}
                    style={{ fontSize: 11, padding: "4px 10px" }}
                  >
                    {actionLoading === "dispatch" ? "Dispatching..." : "Dispatch"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Assigned resources */}
          {incident.assignedResources?.length > 0 && (
            <div className="card">
              <div className="card-header"><span className="card-title">Assigned Resources</span></div>
              {incident.assignedResources.map((ar, i) => {
                const res = ar.resourceId;
                if (!res || typeof res !== "object") return null;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span style={{ fontSize: 18 }}>{RESOURCE_ICONS[res.type]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{res.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{res.publicId}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: ar.status === "on_scene" ? "#450a0a" : "#1e3a5f", color: ar.status === "on_scene" ? "#fca5a5" : "#93c5fd" }}>
                      {ar.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Source reports */}
          {incident.sourceReports?.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Source Reports ({incident.sourceReports.length})</span>
              </div>
              {incident.sourceReports.map((rep, i) => (
                <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <div style={{ color: "var(--text-muted)", marginBottom: 2 }}>{rep.publicId} · {formatTimeAgo(rep.createdAt)}</div>
                  <div style={{ color: "var(--text-secondary)" }}>{rep.description?.substring(0, 100)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Resolution */}
          {incident.status === "RESOLVED" && incident.resolution && (
            <div className="card" style={{ borderLeft: "3px solid var(--success)" }}>
              <div className="card-header"><span className="card-title">✅ Resolution</span></div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Resolved {formatDateTime(incident.resolution.resolvedAt)}</div>
              {incident.resolution.resolutionNote && (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{incident.resolution.resolutionNote}</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Resolve modal */}
      {showResolveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div className="card" style={{ width: 400, maxWidth: "90vw" }}>
            <h3 style={{ marginBottom: 16 }}>Resolve Incident</h3>
            <div className="form-group">
              <label className="form-label">Resolution Note (optional)</label>
              <textarea
                className="form-input"
                placeholder="Describe how the incident was resolved..."
                value={resolveNote}
                onChange={(e) => setResolveNote(e.target.value)}
                rows={3}
              />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost" onClick={() => setShowResolveModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={handleResolve}>Resolve Incident</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
