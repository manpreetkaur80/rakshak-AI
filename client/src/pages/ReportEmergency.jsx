import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { incidentAPI } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getErrorMessage, TYPE_ICONS } from "../utils/helpers";

// Fix Leaflet icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const INCIDENT_TYPES = [
  { value: "fire", label: "🔥 Fire" },
  { value: "flood", label: "🌊 Flood" },
  { value: "medical", label: "🚑 Medical" },
  { value: "accident", label: "🚗 Accident" },
  { value: "industrial", label: "🏭 Industrial" },
  { value: "structural", label: "🏗️ Structural" },
  { value: "other", label: "⚠️ Other" },
];

const DEFAULT_CENTER = [23.0225, 72.5714]; // Ahmedabad

function LocationPicker({ onLocationChange }) {
  useMapEvents({
    click(e) {
      onLocationChange([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function ReportEmergency() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    type: "",
    description: "",
    address: "",
  });
  const [markerPos, setMarkerPos] = useState(null);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const handleGeoLocation = () => {
    setGeoLoading(true);
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser. Please select location on map.");
      setGeoLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMarkerPos([pos.coords.latitude, pos.coords.longitude]);
        setGeoLoading(false);
      },
      () => {
        setGeoError("Location access denied. Please click on the map to set location.");
        setGeoLoading(false);
      },
      { timeout: 8000 }
    );
  };

  useEffect(() => {
    // Try auto-geolocation on mount
    handleGeoLocation();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.description.trim()) {
      setError("Please describe the emergency");
      return;
    }
    if (!markerPos) {
      setError("Please select your location on the map or use 'Use My Location'");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        type: form.type || undefined,
        description: form.description.trim(),
        address: form.address.trim() || "Location selected on map",
        location: {
          type: "Point",
          coordinates: [markerPos[1], markerPos[0]], // [lon, lat]
        },
      };
      const res = await incidentAPI.create(payload);
      setResult(res.data.data.incident);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Show confirmation screen after successful submission
  if (result) {
    const ai = result.aiClassification;
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Report Received</h1>
          <p style={{ color: "var(--text-muted)", marginBottom: 24, fontSize: 14 }}>
            Your emergency has been reported and is being reviewed by our response team.
          </p>
          <div className="card" style={{ textAlign: "left", marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Incident ID</div>
                <div style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--accent)", fontSize: 15 }}>{result.publicId}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Type</div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {TYPE_ICONS[result.type]} {result.type?.charAt(0).toUpperCase() + result.type?.slice(1)}
                </div>
              </div>
              {ai && (
                <>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Severity</div>
                    <div style={{ fontWeight: 700, color: result.severity === "critical" ? "#f87171" : result.severity === "high" ? "#fb923c" : "#fcd34d" }}>
                      {result.severity?.toUpperCase()}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Priority</div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{result.priority}</div>
                  </div>
                </>
              )}
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>Status</div>
                <div style={{ fontWeight: 600, color: "var(--success)" }}>
                  {result.status}
                </div>
              </div>
            </div>
            {ai?.summary && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--accent-light)", borderRadius: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--accent)", fontSize: 11, fontWeight: 700, display: "block", marginBottom: 4 }}>
                  {ai.isFallback ? "⚙️ Rule-based" : "🤖 AI"} Assessment
                </span>
                {ai.summary}
              </div>
            )}
          </div>
          <div className="alert-strip warning" style={{ marginBottom: 16, textAlign: "left", fontSize: 12 }}>
            ⚠️ Your report has been received. Do not call emergency numbers unless the situation is immediately life-threatening. This is a demo platform.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => navigate(`/track?id=${result.publicId}`)}>
              Track Incident
            </button>
            <button className="btn btn-ghost" onClick={() => { setResult(null); setForm({ type: "", description: "", address: "" }); setMarkerPos(null); }}>
              Report Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex" }}>
      {/* Left: form */}
      <div style={{ width: 440, flexShrink: 0, padding: 32, overflowY: "auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🚨</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Report Emergency</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
            Describe the emergency and set your location. This is a demo platform.
          </p>
        </div>

        {error && <div className="alert-strip error" style={{ marginBottom: 16 }}>❌ {error}</div>}
        {geoError && <div className="alert-strip warning" style={{ marginBottom: 16 }}>⚠️ {geoError}</div>}

        <form onSubmit={handleSubmit}>
          {/* Type selection */}
          <div className="form-group">
            <label className="form-label">Emergency Type (optional)</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {INCIDENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm({ ...form, type: form.type === t.value ? "" : t.value })}
                  style={{
                    padding: "8px 4px",
                    borderRadius: 6,
                    border: `2px solid ${form.type === t.value ? "var(--accent)" : "var(--border)"}`,
                    background: form.type === t.value ? "var(--accent-light)" : "var(--bg-input)",
                    color: "var(--text-primary)",
                    fontSize: 11,
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea
              className="form-input"
              placeholder="Describe what is happening... (required)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
              rows={4}
              maxLength={2000}
            />
            <div className="form-hint">{form.description.length}/2000 characters</div>
          </div>

          {/* Address */}
          <div className="form-group">
            <label className="form-label">Address / Landmark (optional)</label>
            <input
              className="form-input"
              placeholder="E.g. Near Central Market, Ahmedabad"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>

          {/* Location */}
          <div className="form-group">
            <label className="form-label">Location *</label>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleGeoLocation}
              disabled={geoLoading}
              style={{ marginBottom: 8, width: "100%" }}
            >
              {geoLoading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Getting location...</> : "📍 Use My Location"}
            </button>
            {markerPos && (
              <div style={{ fontSize: 11, color: "var(--success)", marginBottom: 8 }}>
                ✅ Location set: {markerPos[0].toFixed(5)}, {markerPos[1].toFixed(5)}
              </div>
            )}
            {!markerPos && <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>Click on the map to set location</div>}
          </div>

          <button
            type="submit"
            className="btn btn-danger btn-full"
            disabled={submitting || !form.description || !markerPos}
            style={{ padding: "13px", fontSize: 15, fontWeight: 700 }}
          >
            {submitting ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Submitting...</> : "🚨 Submit Emergency Report"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
          ⚠️ This is a hackathon demo. Do not use for real emergencies.
          AI recommendations are advisory only and require human verification.
        </div>
      </div>

      {/* Right: map */}
      <div style={{ flex: 1 }}>
        <MapContainer center={DEFAULT_CENTER} zoom={13} style={{ height: "100vh", width: "100%" }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          <LocationPicker onLocationChange={setMarkerPos} />
          {markerPos && <Marker position={markerPos} />}
        </MapContainer>
      </div>
    </div>
  );
}
