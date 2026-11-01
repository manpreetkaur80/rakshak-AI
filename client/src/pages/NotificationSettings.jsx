import { useState, useEffect } from "react";
import AppLayout from "../components/common/AppLayout";
import { notificationAPI } from "../services/api";
import { useToast } from "../components/common/Toast";
import { getErrorMessage } from "../utils/helpers";
import { Bell, Save } from "lucide-react";

const E164 = /^\+[1-9]\d{7,14}$/;

const CHANNELS = [
  { key: "email", label: "Email", desc: "Alerts and updates sent to your account email" },
  { key: "sms", label: "SMS", desc: "Text messages for urgent events (needs a phone number below)" },
  { key: "push", label: "Push / desktop", desc: "Live in-app and browser notifications" },
];

export default function NotificationSettings() {
  const addToast = useToast();
  const [prefs, setPrefs] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notificationAPI.getPreferences()
      .then((res) => {
        const d = res.data.data || {};
        setPrefs({ email: d.email !== false, sms: d.sms !== false, push: d.push !== false, phone: d.phone || "" });
      })
      .catch((err) => setLoadError(getErrorMessage(err)));
  }, []);

  const phone = (prefs?.phone || "").trim();
  const phoneInvalid = phone !== "" && !E164.test(phone);

  const save = async (e) => {
    e.preventDefault();
    if (phoneInvalid) return addToast("Phone must be in international format, e.g. +919876543210", "error");
    if (prefs.sms && phone === "") addToast("SMS is on but no phone number is set — SMS will be skipped", "warning");
    setSaving(true);
    try {
      const res = await notificationAPI.updatePreferences({
        email: prefs.email, sms: prefs.sms, push: prefs.push, phone: phone === "" ? null : phone,
      });
      const d = res.data.data;
      if (d) setPrefs({ email: d.email !== false, sms: d.sms !== false, push: d.push !== false, phone: d.phone || "" });
      addToast("Notification settings saved", "success");
    } catch (err) {
      addToast(getErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notification Settings</h1>
          <p className="page-subtitle">Choose how you want to be alerted about incidents</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div className="card-header"><span className="card-title"><Bell size={14} /> Channels</span></div>
        {loadError ? (
          <div className="alert-strip error">❌ {loadError}</div>
        ) : !prefs ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : (
          <form onSubmit={save}>
            {CHANNELS.map((c) => (
              <label key={c.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                <span>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{c.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{c.desc}</span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs[c.key]}
                  onChange={(e) => setPrefs((p) => ({ ...p, [c.key]: e.target.checked }))}
                  style={{ width: 18, height: 18 }}
                />
              </label>
            ))}

            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Mobile number (for SMS)</label>
              <input
                className={`form-input${phoneInvalid ? " error" : ""}`}
                type="tel"
                placeholder="+919876543210"
                value={prefs.phone}
                onChange={(e) => setPrefs((p) => ({ ...p, phone: e.target.value }))}
              />
              <div style={{ fontSize: 11, color: phoneInvalid ? "var(--danger)" : "var(--text-muted)", marginTop: 4 }}>
                {phoneInvalid ? "Use international format: + country code, then number (no spaces)." : "International (E.164) format, e.g. +91 followed by 10 digits. Leave empty to disable SMS."}
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving || phoneInvalid}>
              <Save size={14} /> {saving ? "Saving..." : "Save Settings"}
            </button>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
