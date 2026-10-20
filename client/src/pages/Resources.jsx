import { useState, useEffect } from "react";
import { resourceAPI } from "../services/api";
import { getSocket } from "../services/socket";
import AppLayout from "../components/common/AppLayout";
import LiveMap from "../components/map/LiveMap";
import { getErrorMessage, RESOURCE_ICONS } from "../utils/helpers";
import { RefreshCw } from "lucide-react";
import { useToast } from "../components/common/Toast";

const TYPES = ["", "fire_team", "ambulance", "police", "rescue", "hospital"];
const STATUSES = ["", "available", "assigned", "en_route", "on_scene", "unavailable", "maintenance"];

const STATUS_STYLE = {
  available: { background: "#052e16", color: "#86efac" },
  assigned: { background: "#1e3a5f", color: "#93c5fd" },
  en_route: { background: "#451a03", color: "#fcd34d" },
  on_scene: { background: "#450a0a", color: "#fca5a5" },
  unavailable: { background: "#1f2937", color: "#9ca3af" },
  maintenance: { background: "#1f2937", color: "#9ca3af" },
};

export default function Resources() {
  const addToast = useToast();
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState("table");

  const loadResources = async () => {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter) params.type = typeFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await resourceAPI.list(params);
      setResources(res.data.data || []);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadResources(); }, [typeFilter, statusFilter]);

  useEffect(() => {
    const socket = getSocket();
    socket.on("resource:updated", (data) => {
      setResources((prev) => prev.map((r) => r.publicId === data.resourceId ? { ...r, status: data.status } : r));
    });
    return () => socket.off("resource:updated");
  }, []);

  const byType = TYPES.slice(1).map((t) => ({
    type: t,
    all: resources.filter((r) => r.type === t),
    available: resources.filter((r) => r.type === t && r.status === "available").length,
  }));

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resources</h1>
          <p className="page-subtitle">{resources.length} total · {resources.filter((r) => r.status === "available").length} available</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`btn btn-sm ${view === "table" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("table")}>Table</button>
          <button className={`btn btn-sm ${view === "map" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("map")}>Map</button>
          <button className="btn btn-ghost btn-sm" onClick={loadResources}><RefreshCw size={14} /></button>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
        {byType.map(({ type, all, available }) => (
          <div key={type} className="card card-sm" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{RESOURCE_ICONS[type]}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>{available}/{all.length}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "capitalize" }}>{type.replace("_", " ")}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16, display: "flex", gap: 10 }}>
        <select className="form-input" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ flex: "0 0 150px" }}>
          <option value="">All Types</option>
          {TYPES.slice(1).map((t) => <option key={t} value={t}>{RESOURCE_ICONS[t]} {t.replace("_", " ")}</option>)}
        </select>
        <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: "0 0 140px" }}>
          <option value="">All Statuses</option>
          {STATUSES.slice(1).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner spinner-lg" /></div>
      ) : view === "map" ? (
        <div className="card" style={{ padding: 0, overflow: "hidden", height: "calc(100vh - 320px)" }}>
          <LiveMap resources={resources} incidents={[]} height="100%" />
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Capabilities</th>
                  <th>Current Incident</th>
                </tr>
              </thead>
              <tbody>
                {resources.map((res) => (
                  <tr key={res._id || res.publicId}>
                    <td><span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--accent)" }}>{res.publicId}</span></td>
                    <td>
                      <span style={{ fontSize: 16, marginRight: 6 }}>{RESOURCE_ICONS[res.type]}</span>
                      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{res.name}</span>
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{res.type?.replace("_", " ")}</td>
                    <td>
                      <span style={{
                        ...STATUS_STYLE[res.status],
                        fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, textTransform: "uppercase",
                      }}>
                        {res.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(res.capabilities || []).map((cap) => (
                          <span key={cap} className="tag" style={{ fontSize: 10 }}>{cap.replace("_", " ")}</span>
                        ))}
                      </div>
                    </td>
                    <td>
                      {res.currentIncident
                        ? <span style={{ fontSize: 12, color: "var(--warning)", fontFamily: "monospace" }}>{res.currentIncident.publicId}</span>
                        : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
