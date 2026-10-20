import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { incidentAPI } from "../services/api";
import { getSocket } from "../services/socket";
import AppLayout from "../components/common/AppLayout";
import SeverityBadge from "../components/common/SeverityBadge";
import StatusBadge from "../components/common/StatusBadge";
import { formatTimeAgo, TYPE_ICONS, getErrorMessage } from "../utils/helpers";
import { Search, Filter, RefreshCw, Plus } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const STATUSES = ["", "REPORTED", "CLASSIFIED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "RESOLVED", "CLOSED", "DUPLICATE_CANDIDATE", "MERGED"];
const TYPES = ["", "fire", "flood", "medical", "accident", "industrial", "structural", "other"];
const SEVERITIES = ["", "critical", "high", "medium", "low"];

export default function Incidents() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ status: "", type: "", severity: "", search: "" });
  const [total, setTotal] = useState(0);

  const loadIncidents = async (f = filters) => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (f.status) params.status = f.status;
      if (f.type) params.type = f.type;
      if (f.severity) params.severity = f.severity;
      if (f.search) params.search = f.search;
      params.limit = 100;
      const res = await incidentAPI.list(params);
      setIncidents(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadIncidents(); }, []);

  useEffect(() => {
    const socket = getSocket();
    socket.on("incident:created", (data) => {
      setIncidents((prev) => [data, ...prev]);
      setTotal((t) => t + 1);
    });
    socket.on("incident:updated", (data) => {
      setIncidents((prev) => prev.map((inc) => inc.publicId === data.publicId ? { ...inc, ...data } : inc));
    });
    return () => { socket.off("incident:created"); socket.off("incident:updated"); };
  }, []);

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    loadIncidents(newFilters);
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Incidents</h1>
          <p className="page-subtitle">{total} total incidents</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => loadIncidents()}>
            <RefreshCw size={14} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate("/report")}>
            <Plus size={14} /> Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 180px" }}>
            <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              className="form-input"
              placeholder="Search incidents..."
              style={{ paddingLeft: 28 }}
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
          </div>
          <select className="form-input" style={{ flex: "0 0 130px" }} value={filters.status} onChange={(e) => handleFilterChange("status", e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input" style={{ flex: "0 0 120px" }} value={filters.type} onChange={(e) => handleFilterChange("type", e.target.value)}>
            <option value="">All Types</option>
            {TYPES.slice(1).map((t) => <option key={t} value={t}>{TYPE_ICONS[t]} {t}</option>)}
          </select>
          <select className="form-input" style={{ flex: "0 0 120px" }} value={filters.severity} onChange={(e) => handleFilterChange("severity", e.target.value)}>
            <option value="">All Severities</option>
            {SEVERITIES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="alert-strip error" style={{ marginBottom: 16 }}>❌ {error}</div>}

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : incidents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No incidents found</div>
            <div className="empty-state-desc">Try adjusting your filters</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Severity</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Reported</th>
                  <th>AI</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <tr
                    key={inc._id || inc.publicId}
                    style={{ cursor: "pointer" }}
                    onClick={() => navigate(`/incidents/${inc.publicId}`)}
                  >
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent)" }}>{inc.publicId}</span>
                    </td>
                    <td>
                      <span>{TYPE_ICONS[inc.type]} {inc.type}</span>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                        {inc.title || inc.description?.substring(0, 50)}
                      </div>
                    </td>
                    <td><SeverityBadge severity={inc.severity} /></td>
                    <td>
                      <span className={`badge badge-${(inc.priority || "P3").toLowerCase()}`}>{inc.priority}</span>
                    </td>
                    <td><StatusBadge status={inc.status} /></td>
                    <td style={{ fontSize: 12, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inc.address || "—"}
                    </td>
                    <td style={{ fontSize: 12 }}>{formatTimeAgo(inc.createdAt)}</td>
                    <td>
                      {inc.aiClassification ? (
                        <span style={{ fontSize: 11, color: inc.aiClassification.isFallback ? "var(--warning)" : "var(--accent)" }}>
                          {inc.aiClassification.isFallback ? "Rules" : "AI"} {Math.round((inc.aiClassification.confidence || 0) * 100)}%
                        </span>
                      ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
