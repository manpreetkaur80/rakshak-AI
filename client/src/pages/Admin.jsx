import { useState } from "react";
import AppLayout from "../components/common/AppLayout";
import { demoAPI, resourceAPI } from "../services/api";
import { getSocket } from "../services/socket";
import { useToast } from "../components/common/Toast";
import { getErrorMessage } from "../utils/helpers";
import { Play, Database, Zap } from "lucide-react";

export default function Admin() {
  const addToast = useToast();
  const [simRunning, setSimRunning] = useState(false);
  const [simLog, setSimLog] = useState([]);
  const [seedLoading, setSeedLoading] = useState(false);

  const startSimulation = async () => {
    setSimRunning(true);
    setSimLog([]);
    try {
      const res = await demoAPI.marketFire();
      addToast(`Simulation started: ${res.data.data.simulationId}`, "success");

      // Listen to demo steps via socket
      const socket = getSocket();
      const handleStep = (data) => {
        setSimLog((prev) => [...prev, { ts: new Date(), msg: data.message }]);
      };
      const handleComplete = (data) => {
        setSimLog((prev) => [...prev, { ts: new Date(), msg: `✅ ${data.message}` }]);
        setSimRunning(false);
        socket.off("demo:step", handleStep);
        socket.off("demo:completed", handleComplete);
        socket.off("demo:error", handleError);
      };
      const handleError = (data) => {
        addToast(`Simulation error: ${data.error}`, "error");
        setSimRunning(false);
        socket.off("demo:step", handleStep);
        socket.off("demo:completed", handleComplete);
        socket.off("demo:error", handleError);
      };
      socket.on("demo:step", handleStep);
      socket.on("demo:completed", handleComplete);
      socket.on("demo:error", handleError);

      // Safety timeout
      setTimeout(() => {
        setSimRunning(false);
        socket.off("demo:step", handleStep);
        socket.off("demo:completed", handleComplete);
        socket.off("demo:error", handleError);
      }, 150000);
    } catch (err) {
      addToast(getErrorMessage(err), "error");
      setSimRunning(false);
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
              ["AI Provider", process.env.VITE_GEMINI_AVAILABLE === "true" ? "Gemini + Fallback" : "Rule-based Fallback"],
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
    </AppLayout>
  );
}
