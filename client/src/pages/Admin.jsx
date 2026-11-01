import { useState, useEffect, useRef } from "react";
import AppLayout from "../components/common/AppLayout";
import { demoAPI, resourceAPI, adminAPI, ingestAPI, notificationAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useToast } from "../components/common/Toast";
import { getErrorMessage, formatDateTime } from "../utils/helpers";
import { Play, Database, Zap, Settings, Users, Save, UserPlus } from "lucide-react";

export default function Admin() {
  const addToast = useToast();
  const [simRunning, setSimRunning] = useState(false);
  const [simLog, setSimLog] = useState([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const cleanupRef = useRef(() => {});

  useEffect(() => () => cleanupRef.current(), []);

  const startSimulation = async () => {
    setSimRunning(true);
    setSimLog([]);

    // Attach listeners BEFORE calling the API so early steps are not missed.
    const socket = getSocket();
    cleanupRef.current();
    let timer = null;
    const handleStep = (data) => {
      setSimLog((prev) => [...prev, { ts: new Date(), msg: data.message }]);
    };
    const cleanup = () => {
      socket.off("demo:step", handleStep);
      socket.off("demo:completed", handleComplete);
      socket.off("demo:error", handleError);
      clearTimeout(timer);
    };
    const handleComplete = (data) => {
      setSimLog((prev) => [...prev, { ts: new Date(), msg: `✅ ${data.message}` }]);
      setSimRunning(false);
      cleanup();
    };
    const handleError = (data) => {
      addToast(`Simulation error: ${data.error}`, "error");
      setSimRunning(false);
      cleanup();
    };
    socket.on("demo:step", handleStep);
    socket.on("demo:completed", handleComplete);
    socket.on("demo:error", handleError);
    cleanupRef.current = cleanup;

    try {
      const res = await demoAPI.marketFire();
      addToast(`Simulation started: ${res.data.data.simulationId}`, "success");
      // Safety timeout
      timer = setTimeout(() => {
        setSimRunning(false);
        cleanup();
      }, 150000);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
      setSimRunning(false);
      cleanup();
    }
  };

  const seedResources = async () => {
    setSeedLoading(true);
    try {
      const res = await resourceAPI.seed();
      addToast(res.data.message || "Resources seeded", "success");
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Demo controls and system management</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Demo simulation */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Play size={14} /> Market Fire Demo Simulation</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
            Runs the complete Market Fire scenario end-to-end:
            report → classification → duplicate detection → dispatch → EN_ROUTE → ON_SCENE → RESOLVED.
            (~2 minutes)
          </p>
          <div className="alert-strip warning" style={{ marginBottom: 16, fontSize: 12 }}>
            ⚠️ This creates synthetic demo incidents. For presentation use only.
          </div>
          <button
            className="btn btn-primary"
            onClick={startSimulation}
            disabled={simRunning}
            style={{ marginBottom: simLog.length > 0 ? 12 : 0 }}
          >
            <Play size={14} /> {simRunning ? "Simulation Running..." : "Start Market Fire Simulation"}
          </button>

          {/* Live log */}
          {simLog.length > 0 && (
            <div style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: 12, maxHeight: 200, overflowY: "auto" }}>
              {simLog.map((entry, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--text-secondary)", padding: "2px 0" }}>
                  <span style={{ color: "var(--text-muted)", marginRight: 8 }}>{entry.ts.toLocaleTimeString()}</span>
                  {entry.msg}
                </div>
              ))}
              {simRunning && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)", paddingTop: 4 }}>
                  <span className="spinner" style={{ width: 12, height: 12 }} /> Running...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Seed data */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><Database size={14} /> Data Management</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.6 }}>
            Seed the database with demo resources (fire teams, ambulances, police units, rescue teams, hospitals).
          </p>
          <button
            className="btn btn-ghost"
            onClick={seedResources}
            disabled={seedLoading}
            style={{ marginBottom: 16 }}
          >
            <Database size={14} /> {seedLoading ? "Seeding..." : "Seed Resources"}
          </button>

          <div className="divider" />

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>Demo Credentials</div>
            <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
              {[
                { role: "Admin", email: "admin@ps9demo.com", pwd: "admin123" },
                { role: "Operator", email: "operator@ps9demo.com", pwd: "operator123" },
                { role: "Responder", email: "responder1@ps9demo.com", pwd: "responder123" },
                { role: "Citizen", email: "citizen@ps9demo.com", pwd: "citizen123" },
              ].map((u) => (
                <div key={u.email} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "var(--bg-primary)", borderRadius: 4 }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.role}</span>
                  <span style={{ color: "var(--text-muted)" }}>{u.email}</span>
                  <span style={{ fontFamily: "monospace", color: "var(--accent)" }}>{u.pwd}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System info */}
        <div className="card">
          <div className="card-header"><span className="card-title"><Zap size={14} /> System Information</span></div>
          <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
            {[
              ["Platform", "PS-9 Emergency Response MVP"],
              ["Version", "1.0.0"],
              ["AI Provider", import.meta.env.VITE_GEMINI_AVAILABLE === "true" ? "Gemini + Fallback" : "Rule-based Fallback"],
              ["Database", "MongoDB Atlas"],
              ["Real-time", "Socket.IO"],
              ["Map", "OpenStreetMap + Leaflet"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                <span style={{ color: "var(--text-secondary)", textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginTop: 16 }}>
        <SourcesPanel />
        <NotificationLogPanel />
        <SettingsPanel />
        <UsersPanel />
      </div>
    </AppLayout>
  );
}

// ── Escalation & duplicate-detection settings ─────────────────────────────────
const num = (v) => (v === "" || v === null || v === undefined ? "" : Number(v));

function SettingsPanel() {
  const addToast = useToast();
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminAPI.getConfig()
      .then((res) => setCfg(res.data.data))
      .catch((err) => addToast(getErrorMessage(err), "error"));
  }, []);

  const setEsc = (prio, key, value) =>
    setCfg((c) => ({ ...c, escalation: { ...c.escalation, [prio]: { ...c.escalation[prio], [key]: value } } }));
  const setAuto = (key, value) =>
    setCfg((c) => ({ ...c, autoDispatch: { ...(c.autoDispatch || {}), [key]: value } }));
  const setDup = (key, value) =>
    setCfg((c) => ({ ...c, duplicate: { ...c.duplicate, [key]: value } }));

  const save = async (e) => {
    e.preventDefault();
    const esc = cfg.escalation || {};
    for (const p of ["P1", "P2"]) {
      const w = Number(esc[p]?.warningAfterMinutes);
      const c = Number(esc[p]?.criticalAfterMinutes);
      if (!(w > 0) || !(c > 0)) return addToast(`${p}: thresholds must be positive numbers`, "error");
      if (c < w) return addToast(`${p}: critical threshold must not be below the warning threshold`, "error");
    }
    const d = cfg.duplicate || {};
    if (!(Number(d.radiusMeters) > 0) || !(Number(d.timeWindowMinutes) > 0)) {
      return addToast("Duplicate radius and time window must be positive", "error");
    }
    if (!(Number(d.threshold) > 0 && Number(d.threshold) <= 1)) {
      return addToast("Duplicate threshold must be between 0 and 1", "error");
    }
    setSaving(true);
    try {
      const payload = {
        escalation: Object.fromEntries(["P1", "P2"].map((p) => [p, {
          warningAfterMinutes: Number(esc[p].warningAfterMinutes),
          criticalAfterMinutes: Number(esc[p].criticalAfterMinutes),
        }])),
        autoDispatch: { enabled: !!cfg.autoDispatch?.enabled, minPriority: cfg.autoDispatch?.minPriority || "P1" },
        duplicate: {
          radiusMeters: Number(d.radiusMeters),
          timeWindowMinutes: Number(d.timeWindowMinutes),
          threshold: Number(d.threshold),
        },
      };
      const res = await adminAPI.updateConfig(payload);
      setCfg(res.data.data || cfg);
      addToast("Settings saved", "success");
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const field = (label, value, onChange, props = {}) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <input className="form-input" type="number" min="0" value={num(value)} onChange={(e) => onChange(e.target.value)} {...props} />
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Settings size={14} /> Escalation & Duplicate Detection</span>
      </div>
      {!cfg ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <form onSubmit={save}>
          {["P1", "P2"].map((p) => (
            <div key={p} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>
                {p} escalation (minutes unassigned)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {field("Warning after", cfg.escalation?.[p]?.warningAfterMinutes, (v) => setEsc(p, "warningAfterMinutes", v), { step: 1 })}
                {field("Critical after", cfg.escalation?.[p]?.criticalAfterMinutes, (v) => setEsc(p, "criticalAfterMinutes", v), { step: 1 })}
              </div>
            </div>
          ))}
          <div className="divider" />
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "16px 0 8px" }}>
            Duplicate detection
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {field("Radius (m)", cfg.duplicate?.radiusMeters, (v) => setDup("radiusMeters", v), { step: 10 })}
            {field("Time window (min)", cfg.duplicate?.timeWindowMinutes, (v) => setDup("timeWindowMinutes", v), { step: 1 })}
            {field("Match threshold (0–1)", cfg.duplicate?.threshold, (v) => setDup("threshold", v), { step: 0.05, max: 1 })}
          </div>
          <div className="divider" />
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", margin: "16px 0 8px" }}>
            Auto-dispatch
          </div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 6 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
              <input type="checkbox" checked={!!cfg.autoDispatch?.enabled} onChange={(e) => setAuto("enabled", e.target.checked)} />
              Dispatch the recommended units automatically
            </label>
            <select className="form-input" style={{ width: 150 }} value={cfg.autoDispatch?.minPriority || "P1"} onChange={(e) => setAuto("minPriority", e.target.value)}>
              <option value="P1">P1 only</option>
              <option value="P2">P1 and P2</option>
              <option value="P3">P1 – P3</option>
            </select>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>
            Never applied to suspected duplicates or low-credibility reports. Operators can always recall a dispatch.
          </p>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={14} /> {saving ? "Saving..." : "Save Settings"}
          </button>
        </form>
      )}
    </div>
  );
}

// ── User management ───────────────────────────────────────────────────────────
const ROLES = ["operator", "responder", "admin", "hospital", "citizen"];

function UsersPanel() {
  const addToast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "operator" });

  const load = async () => {
    try {
      const res = await adminAPI.listUsers();
      setUsers(res.data.data || []);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const patch = async (u, changes, msg) => {
    setBusyId(u._id);
    try {
      await adminAPI.updateUser(u._id, changes);
      setUsers((prev) => prev.map((x) => (x._id === u._id ? { ...x, ...changes } : x)));
      addToast(msg, "success");
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setBusyId("");
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (form.password.length < 6) return addToast("Password must be at least 6 characters", "error");
    setCreating(true);
    try {
      await adminAPI.createUser({ ...form, email: form.email.trim() });
      addToast(`User ${form.email} created`, "success");
      setForm({ name: "", email: "", password: "", role: "operator" });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Users size={14} /> User Management</span>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{users.length} users</span>
      </div>

      <form onSubmit={create} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.4fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 16 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Name</label>
          <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Password</label>
          <input className="form-input" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Role</label>
          <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={creating}>
          <UserPlus size={14} /> {creating ? "Creating..." : "Add"}
        </button>
      </form>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} style={{ opacity: u.isActive === false ? 0.55 : 1 }}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{u.publicId}</td>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      className="form-input"
                      style={{ fontSize: 12, padding: "4px 8px", width: "auto" }}
                      value={u.role}
                      disabled={busyId === u._id}
                      onChange={(e) => patch(u, { role: e.target.value }, `${u.name} is now ${e.target.value}`)}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDateTime(u.lastLoginAt)}</td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.isActive === false ? "btn-success" : "btn-ghost"}`}
                      disabled={busyId === u._id}
                      onClick={() => patch(u, { isActive: u.isActive === false }, u.isActive === false ? `${u.name} activated` : `${u.name} deactivated`)}
                    >
                      {u.isActive === false ? "Activate" : "Deactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
// ── Multi-source ingestion simulator ──────────────────────────────────────────
const SOURCES = ["sensor", "call", "hospital", "govt", "field"];

function SourcesPanel() {
  const addToast = useToast();
  const [counts, setCounts] = useState([]);
  const [busy, setBusy] = useState("");

  const load = async () => {
    try { setCounts((await ingestAPI.sources()).data.data || []); } catch { /* optional */ }
  };
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const run = async (label, fn) => {
    setBusy(label);
    try {
      await fn();
      addToast(`${label} sent`, "success");
      setTimeout(load, 3500);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title"><Zap size={14} /> Data Sources (last 24h)</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {["web", ...SOURCES].map((s) => (
          <span key={s} className="badge" style={{ textTransform: "uppercase" }}>
            {s}: {counts.find((c) => c.sourceType === s)?.count ?? 0}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.6 }}>
        Real feeds POST to <code>/api/v1/ingest/&lt;source&gt;</code> with an <code>x-api-key</code> header.
        Use these buttons to simulate them.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SOURCES.map((s) => (
          <button key={s} className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => run(`Simulated ${s}`, () => ingestAPI.simulate(s))}>
            Simulate {s}
          </button>
        ))}
        <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => run("Multi-source fire scenario", () => ingestAPI.simulateScenario())}>
          <Play size={12} /> Multi-source fire scenario
        </button>
      </div>
    </div>
  );
}

// ── Notification delivery log ─────────────────────────────────────────────────
function NotificationLogPanel() {
  const addToast = useToast();
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);

  const load = async () => {
    try {
      const res = await notificationAPI.log({ limit: 25 });
      setLog(res.data.data || []);
      setSummary(res.data.meta?.summary || null);
    } catch { /* optional */ }
  };
  useEffect(() => { load(); }, []);

  const test = async (channel) => {
    try {
      await notificationAPI.test(channel);
      addToast(`Test ${channel} sent`, "success");
      load();
    } catch (err) { addToast(getErrorMessage(err), "error"); }
  };

  const color = { sent: "var(--success)", delivered: "var(--success)", pending: "var(--warning)", failed: "var(--danger)", skipped: "var(--text-muted)" };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Notification Delivery Log</span>
        <div style={{ display: "flex", gap: 6 }}>
          {["in_app", "email", "sms"].map((c) => <button key={c} className="btn btn-ghost btn-sm" onClick={() => test(c)}>Test {c.replace("_", "-")}</button>)}
          <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
        </div>
      </div>
      {summary && (
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{JSON.stringify(summary)}</div>
      )}
      {log.length === 0 ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>No notifications yet.</div> : (
        <table className="table">
          <thead><tr><th>When</th><th>To</th><th>Channel</th><th>Title</th><th>Status</th><th>Tries</th></tr></thead>
          <tbody>
            {log.map((n) => (
              <tr key={n._id}>
                <td style={{ fontSize: 12 }}>{formatDateTime(n.createdAt)}</td>
                <td style={{ fontSize: 12 }}>{n.userId?.name || "—"}</td>
                <td>{n.channel}</td>
                <td style={{ fontSize: 12 }}>{n.title}</td>
                <td style={{ color: color[n.status], fontWeight: 600 }} title={n.lastError || ""}>{n.status}</td>
                <td>{n.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
