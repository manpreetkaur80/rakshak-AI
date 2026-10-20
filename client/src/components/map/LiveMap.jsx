import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { TYPE_ICONS, RESOURCE_ICONS, SEVERITY_COLORS } from "../../utils/helpers";

// Fix Leaflet default icon issue with Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function createIncidentIcon(severity, type) {
  const color = SEVERITY_COLORS[severity] || "#6366f1";
  const emoji = TYPE_ICONS[type] || "⚠️";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      border:2px solid #fff;
      border-radius:50%;
      width:30px;height:30px;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;
      box-shadow:0 2px 6px rgba(0,0,0,0.5);
      cursor:pointer;
    ">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

function createResourceIcon(type, status) {
  const statusColors = {
    available: "#22c55e",
    assigned: "#3b82f6",
    en_route: "#f59e0b",
    on_scene: "#ef4444",
    unavailable: "#6b7280",
    maintenance: "#6b7280",
  };
  const color = statusColors[status] || "#6b7280";
  const emoji = RESOURCE_ICONS[type] || "🚨";
  return L.divIcon({
    className: "",
    html: `<div style="
      background:${color};
      border:2px solid #fff;
      border-radius:6px;
      width:28px;height:28px;
      display:flex;align-items:center;justify-content:center;
      font-size:13px;
      box-shadow:0 2px 6px rgba(0,0,0,0.5);
      cursor:pointer;
    ">${emoji}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function MapCenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
}

export default function LiveMap({
  incidents = [],
  resources = [],
  selectedIncident = null,
  routes = [],
  height = "100%",
  onIncidentClick,
  onResourceClick,
}) {
  // Ahmedabad center
  const defaultCenter = [23.0225, 72.5714];
  const defaultZoom = 12;

  const mapCenter = selectedIncident?.location?.coordinates
    ? [selectedIncident.location.coordinates[1], selectedIncident.location.coordinates[0]]
    : defaultCenter;

  return (
    <div style={{ height, width: "100%", borderRadius: "8px", overflow: "hidden" }}>
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {selectedIncident && <MapCenter center={mapCenter} zoom={14} />}

        {/* Incident markers */}
        {incidents.map((inc) => {
          if (!inc.location?.coordinates) return null;
          const [lon, lat] = inc.location.coordinates;
          return (
            <Marker
              key={inc._id || inc.publicId}
              position={[lat, lon]}
              icon={createIncidentIcon(inc.severity, inc.type)}
              eventHandlers={{ click: () => onIncidentClick && onIncidentClick(inc) }}
            >
              <Popup>
                <div style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {TYPE_ICONS[inc.type]} {inc.publicId}
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{inc.title}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    Severity: <strong style={{ color: SEVERITY_COLORS[inc.severity] }}>{inc.severity?.toUpperCase()}</strong>
                    &nbsp;·&nbsp;{inc.status}
                  </div>
                  {inc.address && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{inc.address}</div>}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Resource markers */}
        {resources.map((res) => {
          if (!res.location?.coordinates) return null;
          const [lon, lat] = res.location.coordinates;
          return (
            <Marker
              key={res._id || res.publicId}
              position={[lat, lon]}
              icon={createResourceIcon(res.type, res.status)}
              eventHandlers={{ click: () => onResourceClick && onResourceClick(res) }}
            >
              <Popup>
                <div style={{ minWidth: 180 }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    {RESOURCE_ICONS[res.type]} {res.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>
                    {res.publicId} · Status: <strong>{res.status}</strong>
                  </div>
                  {res.currentIncident && (
                    <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>
                      Assigned to: {res.currentIncident.publicId}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Routes */}
        {routes.map((route, i) => (
          <Polyline
            key={i}
            positions={route.points}
            pathOptions={{ color: "#f59e0b", weight: 3, dashArray: "8 4" }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
