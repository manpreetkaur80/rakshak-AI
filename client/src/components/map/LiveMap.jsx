import { useEffect, useState } from "react";
import { getSocket } from "../../services/socket";
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

function createResourceIcon(type, status, moving = false) {
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
    // "unit-marker" gives the marker a CSS transition so position updates glide instead of jumping
    className: "unit-marker",
    html: `<div class="${moving ? "unit-moving" : ""}" style="
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
  const lat = center ? center[0] : null;
  const lng = center ? center[1] : null;
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], zoom || map.getZoom());
  }, [lat, lng, zoom, map]);
  return null;
}

/** Subscribes to live unit movement from the server and returns { positions, routes } keyed by unit id. */
function useLiveUnits() {
  const [positions, setPositions] = useState({}); // id -> { pos:[lat,lon], heading, phase, type, name, incidentId }
  const [routes, setRoutes] = useState({}); // id -> { points:[[lat,lon]...], phase, incidentId }

  useEffect(() => {
    const socket = getSocket();
    const onLocation = (d) => {
      setPositions((prev) => ({
        ...prev,
        [d.resourceId]: {
          pos: [d.location[1], d.location[0]],
          heading: d.heading,
          phase: d.phase,
          type: d.type || prev[d.resourceId]?.type,
          name: d.name || prev[d.resourceId]?.name,
          incidentId: d.incidentId ?? prev[d.resourceId]?.incidentId ?? null,
        },
      }));
      // Journey finished: drop the dashed route shortly after arrival
      if (d.phase === "arrived" || d.phase === "home") {
        setTimeout(() => setRoutes((prev) => { const n = { ...prev }; delete n[d.resourceId]; return n; }), 4000);
      }
    };
    const onRoute = (d) => {
      setRoutes((prev) => ({ ...prev, [d.resourceId]: { points: d.points, phase: d.phase, incidentId: d.incidentId, road: d.roadRoute } }));
    };
    socket.on("resource:location", onLocation);
    socket.on("resource:route", onRoute);
    return () => {
      socket.off("resource:location", onLocation);
      socket.off("resource:route", onRoute);
    };
  }, []);

  return { positions, routes };
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
  const live = useLiveUnits();
  const knownIds = new Set(resources.map((r) => r.publicId));

  // Moving units that are not in the `resources` prop (e.g. Responder page) are drawn too,
  // but only for the selected incident when one is selected.
  const extraUnits = Object.entries(live.positions).filter(([id, u]) =>
    !knownIds.has(id) && u.phase !== "home" && (!selectedIncident || u.incidentId === selectedIncident.publicId)
  );

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
          const liveUnit = live.positions[res.publicId];
          const moving = !!liveUnit && liveUnit.phase !== "arrived" && liveUnit.phase !== "home";
          const [lon, lat] = res.location.coordinates;
          const position = liveUnit ? liveUnit.pos : [lat, lon];
          return (
            <Marker
              key={res._id || res.publicId}
              position={position}
              icon={createResourceIcon(res.type, res.status, moving)}
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

        {/* Units that are moving but not part of the resources list */}
        {extraUnits.map(([id, u]) => (
          <Marker
            key={`live-${id}`}
            position={u.pos}
            icon={createResourceIcon(u.type, u.phase === "arrived" ? "on_scene" : "en_route", u.phase === "outbound" || u.phase === "return")}
          >
            <Popup>
              <div style={{ fontWeight: 700 }}>{RESOURCE_ICONS[u.type]} {u.name || id}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{id} · {u.phase}</div>
            </Popup>
          </Marker>
        ))}

        {/* Live routes of moving units (road route when available, else straight line) */}
        {Object.entries(live.routes)
          .filter(([, r]) => r.phase === "outbound" && (!selectedIncident || r.incidentId === selectedIncident.publicId))
          .map(([id, r]) => (
            <Polyline key={`route-${id}`} positions={r.points} pathOptions={{ color: "#38bdf8", weight: 4, opacity: 0.8, dashArray: "2 8" }} />
          ))}

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
