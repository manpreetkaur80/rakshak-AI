import { useState, useEffect } from "react";
import { analyticsAPI } from "../services/api";
import AppLayout from "../components/common/AppLayout";
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { RefreshCw, Download } from "lucide-react";
import { TYPE_ICONS, RESOURCE_ICONS } from "../utils/helpers";

const SEVERITY_COLORS = { critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#16a34a" };
const TYPE_COLORS = { fire: "#ef4444", flood: "#3b82f6", medical: "#ec4899", accident: "#f59e0b", industrial: "#8b5cf6", structural: "#14b8a6", other: "#6b7280" };
const CHART_BG = "transparent";
const GRID_COLOR = "#334155";
const TEXT_COLOR = "#94a3b8";

export default function Analytics() {
  const [overview, setOverview] = useState(null);
  const [types, setTypes] = useState([]);
  const [severity, setSeverity] = useState([]);
  const [responseTime, setResponseTime] = useState(null);
  const [resUtil, setResUtil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState({ from: "", to: "" });
  const [shortages, setShortages] = useState(null);
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await analyticsAPI.exportCsv(range);
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `incidents_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ovRes, typeRes, sevRes, rtRes, ruRes] = await Promise.all([
        analyticsAPI.overview(range),
        analyticsAPI.types(range),
        analyticsAPI.severity(range),
        analyticsAPI.responseTime(range),
        // Resource utilisation is optional: don't blank the page if it fails.
        analyticsAPI.resources().catch(() => null),
      ]);
      setResUtil(ruRes?.data?.data || null);
      analyticsAPI.shortages().then((r) => setShortages(r.data.data)).catch(() => setShortages(null));
      setOverview(ovRes.data.data);
      setTypes(typeRes.data.data || []);
      setSeverity(sevRes.data.data || []);
      setResponseTime(rtRes.data.data);
    } catch (err) {
      console.error("Analytics load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [range.from, range.to]);

  if (loading) return (
    <AppLayout><div className="loading-center"><div className="spinner spinner-lg" /></div></AppLayout>
  );

  const severityData = severity.map((s) => ({
    name: s.severity?.charAt(0).toUpperCase() + s.severity?.slice(1),
    value: s.count,
    fill: SEVERITY_COLORS[s.severity] || "#6b7280",
  }));

  const typeData = types.map((t) => ({
    name: `${TYPE_ICONS[t.type] || ""} ${t.type}`,
    count: t.count,
    fill: TYPE_COLORS[t.type] || "#6b7280",
  }));

  const rtDaily = (responseTime?.daily || []).slice(-14).map((d) => ({
    date: d.date?.slice(5),
    minutes: d.averageMinutes,
  }));

  const utilByType = (resUtil?.byType || []).map((r) => ({
    name: `${RESOURCE_ICONS[r.type] || ""} ${r.type.replace(/_/g, " ")}`,
    utilization: r.utilizationPercent ?? 0,
    busy: r.busy,
    total: r.total,
  }));
  const overallUtil = resUtil?.utilizationPercent ?? 0;
  // PRD target band: 70–85 % is healthy; above that is a shortage risk.
  const utilColor = overallUtil > 85 ? "var(--danger)" : overallUtil >= 70 ? "var(--warning)" : "var(--success)";

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-subtitle">Incident and response metrics</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="date" className="form-input" style={{ width: 150 }} value={range.from} max={range.to || undefined}
            onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From date" />
          <span style={{ color: "var(--text-muted)" }}>→</span>
          <input type="date" className="form-input" style={{ width: 150 }} value={range.to} min={range.from || undefined}
            onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To date" />
          {(range.from || range.to) && <button className="btn btn-ghost btn-sm" onClick={() => setRange({ from: "", to: "" })}>Clear</button>}
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={exporting}><Download size={14} /> {exporting ? "Exporting…" : "Export CSV"}</button>
          <button className="btn btn-ghost btn-sm" onClick={loadAll}><RefreshCw size={14} /></button>
        </div>
      </div>

      {shortages && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">Resource Shortage Forecast</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              based on {shortages.basis?.incidentsConsidered ?? 0} recent incidents
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            {(shortages.forecast || []).map((f) => {
              const color = f.risk === "high" ? "var(--danger)" : f.risk === "medium" ? "var(--warning)" : "var(--success)";
              return (
                <div key={f.type} style={{ border: `1px solid ${color}`, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{RESOURCE_ICONS[f.type] || ""} {f.type.replace(/_/g, " ")}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0" }}>
                    {f.available} available · {f.expectedDemand ?? f.demand ?? "?"} expected
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase" }}>{f.risk} risk</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card kpi-card-accent">
          <div className="kpi-label">Active</div>
          <div className="kpi-value">{overview?.activeIncidents ?? 0}</div>
          <div className="kpi-sub">Current incidents</div>
        </div>
        <div className="kpi-card kpi-card-danger">
          <div className="kpi-label">Critical</div>
          <div className="kpi-value" style={{ color: "var(--danger)" }}>{overview?.criticalIncidents ?? 0}</div>
          <div className="kpi-sub">Critical severity</div>
        </div>
        <div className="kpi-card kpi-card-warning">
          <div className="kpi-label">Deployed</div>
          <div className="kpi-value" style={{ color: "var(--warning)" }}>{overview?.resourcesDeployed ?? 0}</div>
          <div className="kpi-sub">Resources</div>
        </div>
        <div className="kpi-card kpi-card-accent">
          <div className="kpi-label">Avg Response</div>
          <div className="kpi-value">{overview?.averageResponseTimeMinutes ?? "—"}</div>
          <div className="kpi-sub">Minutes</div>
        </div>
        <div className="kpi-card kpi-card-danger">
          <div className="kpi-label">Alerts</div>
          <div className="kpi-value" style={{ color: "var(--danger)" }}>{overview?.pendingAlerts ?? 0}</div>
          <div className="kpi-sub">Unacknowledged</div>
        </div>
        <div className="kpi-card kpi-card-success">
          <div className="kpi-label">Resolved Today</div>
          <div className="kpi-value" style={{ color: "var(--success)" }}>{overview?.resolvedToday ?? 0}</div>
        </div>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Incidents by type */}
        <div className="card">
          <div className="card-header"><span className="card-title">Incidents by Type</span></div>
          {typeData.length === 0 ? (
            <div className="empty-state"><div className="empty-state-desc">No data yet</div></div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={typeData} margin={{ top: 5, right: 10, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="name" tick={{ fill: TEXT_COLOR, fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: TEXT_COLOR, fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9" }} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {typeData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity distribution */}
        <div className="card">
          <div className="card-header"><span className="card-title">Severity Distribution</span></div>
          {severityData.length === 0 ? (
            <div className="empty-state"><div className="empty-state-desc">No data yet</div></div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ResponsiveContainer width="60%" height={200}>
                <PieChart>
                  <Pie data={severityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`} labelLine={{ stroke: TEXT_COLOR }}>
                    {severityData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9" }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {severityData.map((s) => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.fill }} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{s.name}: {s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Response time trend */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <span className="card-title">Average Response Time (minutes)</span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
              Overall: {responseTime?.averageMinutes ?? "—"} min
            </span>
          </div>
          {rtDaily.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-desc">Response time data will appear as incidents are resolved</div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={rtDaily} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                <XAxis dataKey="date" tick={{ fill: TEXT_COLOR, fontSize: 11 }} />
                <YAxis tick={{ fill: TEXT_COLOR, fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9" }} formatter={(v) => [`${v} min`, "Avg Response Time"]} />
                <Line type="monotone" dataKey="minutes" stroke="var(--accent)" strokeWidth={2} dot={{ fill: "var(--accent)", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Resource utilisation */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <div className="card-header">
            <span className="card-title">Resource Utilization</span>
            {resUtil && (
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {resUtil.deployed ?? 0} deployed · {resUtil.available ?? 0} available · {resUtil.total ?? 0} total
              </span>
            )}
          </div>
          {!resUtil || utilByType.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🚒</div>
              <div className="empty-state-desc">No resource data available</div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center", minWidth: 140 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: utilColor }}>{overallUtil}%</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Overall utilization</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Target 70–85%</div>
              </div>
              <div style={{ flex: 1, minWidth: 280 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={utilByType} margin={{ top: 5, right: 10, bottom: 30, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
                    <XAxis dataKey="name" tick={{ fill: TEXT_COLOR, fontSize: 11 }} interval={0} />
                    <YAxis tick={{ fill: TEXT_COLOR, fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#f1f5f9" }}
                      formatter={(v, _n, p) => [`${v}% (${p.payload.busy}/${p.payload.total} busy)`, "Utilization"]}
                    />
                    <Bar dataKey="utilization" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
