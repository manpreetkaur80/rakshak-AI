import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getErrorMessage } from "../utils/helpers";

const DEMO_ACCOUNTS = [
  { label: "Operator", email: "operator@ps9demo.com", password: "operator123", role: "operator" },
  { label: "Admin", email: "admin@ps9demo.com", password: "admin123", role: "admin" },
  { label: "Responder", email: "responder1@ps9demo.com", password: "responder123", role: "responder" },
  { label: "Citizen", email: "citizen@ps9demo.com", password: "citizen123", role: "citizen" },
];

const ROLE_REDIRECTS = {
  operator: "/dashboard",
  admin: "/dashboard",
  responder: "/responder",
  citizen: "/report",
  hospital: "/dashboard",
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(ROLE_REDIRECTS[user.role] || "/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (acc) => {
    setForm({ email: acc.email, password: acc.password });
    setError("");
    setLoading(true);
    try {
      const user = await login(acc.email, acc.password);
      navigate(ROLE_REDIRECTS[user.role] || "/dashboard", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)", marginBottom: 4 }}>RakshakAI</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Intelligent Emergency Response Platform</p>
        </div>

        {/* Login card */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Sign In</h2>

          {error && (
            <div className="alert-strip error" style={{ marginBottom: 16 }}>
              ❌ {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="Enter your email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Enter your password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
              style={{ marginTop: 8, padding: "11px" }}
            >
              {loading ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Signing in...</> : "Sign In"}
            </button>
          </form>
        </div>

        {/* Quick demo logins */}
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
            Quick Demo Login
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                className="btn btn-ghost btn-sm"
                onClick={() => quickLogin(acc)}
                disabled={loading}
                style={{ justifyContent: "flex-start", gap: 6 }}
              >
                <span style={{ fontSize: 12 }}>
                  {acc.role === "operator" ? "🎮" : acc.role === "admin" ? "⚙️" : acc.role === "responder" ? "🚒" : "👤"}
                </span>
                {acc.label}
              </button>
            ))}
          </div>
        </div>

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--text-muted)" }}>
          Don't have an account?{" "}
          <a href="/register" style={{ color: "var(--accent)" }}>Register as citizen</a>
        </p>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          ⚠️ Demo prototype — not a real emergency service.<br />
          AI recommendations are advisory only.
        </div>
      </div>
    </div>
  );
}
