/**
 * Live unit movement (demo simulation).
 *
 * While a unit is EN_ROUTE it travels from its current position to the incident;
 * when it is released it drives back to its base. Every second the new position is
 * pushed to staff clients (`resource:location`), and the route polyline is sent once
 * when a journey starts (`resource:route`). Positions are saved to MongoDB every few
 * seconds so a page refresh shows the unit where it is.
 *
 * Route: real roads from OSRM when reachable (OSRM_URL, default public demo server;
 * set OSRM_URL=off to disable), otherwise a straight line. The journey is time-compressed
 * (MOVEMENT_SPEED_KMH, default 40; each trip lasts 30s-3min) so a demo does not take real-world minutes.
 */
const Resource = require("../models/Resource");
const { haversineMeters } = require("./duplicate.service");

let io = null;
const setIO = (realtime) => { io = realtime; };

const journeys = new Map(); // resourceId(string) -> journey
const TICK_MS = 1000;
const PERSIST_EVERY_MS = 3000;

const speedKmh = () => parseFloat(process.env.MOVEMENT_SPEED_KMH) || 40;
const osrmBase = () => {
  const v = process.env.OSRM_URL === undefined ? "https://router.project-osrm.org" : process.env.OSRM_URL;
  return !v || v === "off" ? null : v.replace(/\/$/, "");
};

// ── pure geometry helpers (unit-tested) ───────────────────────────────────────
/** path: [[lon,lat], ...] → { cum:[metres from start per vertex], total } */
function measure(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + haversineMeters(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]));
  }
  return { cum, total: cum[cum.length - 1] };
}

function bearing([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/** Position `fraction` (0..1) of the way along the path → { point:[lon,lat], heading } */
function positionAt(path, cum, total, fraction) {
  if (path.length === 1 || total === 0) return { point: path[path.length - 1], heading: 0 };
  const target = Math.min(1, Math.max(0, fraction)) * total;
  let i = 1;
  while (i < path.length - 1 && cum[i] < target) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const t = Math.min(1, Math.max(0, (target - cum[i - 1]) / segLen));
  const [a, b] = [path[i - 1], path[i]];
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) };
}

async function fetchRoadPath(from, to) {
  const base = osrmBase();
  if (!base || process.env.NODE_ENV === "test") return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const url = `${base}/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data.routes && data.routes[0] && data.routes[0].geometry && data.routes[0].geometry.coordinates;
    return coords && coords.length >= 2 ? coords : null;
  } catch {
    return null; // offline / blocked / slow → straight line
  }
}

async function startJourney(resource, destination, phase, incidentId) {
  const from = resource.location.coordinates;
  const road = await fetchRoadPath(from, destination);
  const path = road || [from, destination];
  const { cum, total } = measure(path);
  const durationMs = Math.min(180000, Math.max(30000, (total / 1000 / speedKmh()) * 3600 * 1000));

  const journey = {
    resourceId: String(resource._id),
    publicId: resource.publicId,
    phase,
    incidentId: incidentId || null,
    path, cum, total, durationMs,
    startedAt: Date.now(),
    lastPersist: 0,
    done: false,
  };
  journeys.set(journey.resourceId, journey);
  if (io) {
    io.emit("resource:route", {
      resourceId: resource.publicId,
      type: resource.type,
      name: resource.name,
      phase,
      incidentId: journey.incidentId,
      points: path.map(([lon, lat]) => [lat, lon]),
      durationMs,
      roadRoute: !!road,
    });
  }
  return journey;
}

async function persist(journey, point) {
  journey.lastPersist = Date.now();
  await Resource.updateOne({ _id: journey.resourceId }, { "location.coordinates": point });
}

async function tick() {
  // 1. Begin journeys for units that just went EN_ROUTE
  const enRoute = await Resource.find({ status: "en_route", currentIncident: { $ne: null } }).populate("currentIncident", "publicId location status");
  for (const r of enRoute) {
    const existing = journeys.get(String(r._id));
    if (existing && existing.phase === "outbound") continue;
    if (!r.currentIncident || !r.currentIncident.location) continue;
    await startJourney(r, r.currentIncident.location.coordinates, "outbound", r.currentIncident.publicId);
  }

  // 2. Advance every journey
  for (const j of [...journeys.values()]) {
    const res = await Resource.findById(j.resourceId).select("status baseLocation location publicId type name");
    if (!res) { journeys.delete(j.resourceId); continue; }

    // Status changed under us?
    if (j.phase === "outbound" && res.status !== "en_route") {
      if (res.status === "on_scene") {
        // Operator/responder marked arrival: snap to the scene
        const end = j.path[j.path.length - 1];
        await persist(j, end);
        if (io) io.emit("resource:location", { resourceId: res.publicId, type: res.type, name: res.name, location: end, heading: 0, progress: 1, phase: "arrived", incidentId: j.incidentId });
        journeys.delete(j.resourceId);
        continue;
      }
      if (res.status === "available") {
        journeys.delete(j.resourceId);
        const base = res.baseLocation && res.baseLocation.coordinates && res.baseLocation.coordinates.length === 2 ? res.baseLocation.coordinates : null;
        if (base && haversineMeters(res.location.coordinates[0], res.location.coordinates[1], base[0], base[1]) > 30) {
          await startJourney(res, base, "return", null);
        }
        continue;
      }
      if (res.status !== "assigned") { journeys.delete(j.resourceId); continue; }
    }
    if (j.phase === "return" && res.status !== "available") {
      journeys.delete(j.resourceId); // dispatched again while returning
      continue;
    }
    if (j.done) continue;

    const progress = Math.min(1, (Date.now() - j.startedAt) / j.durationMs);
    const { point, heading } = positionAt(j.path, j.cum, j.total, progress);
    if (io) {
      io.emit("resource:location", {
        resourceId: res.publicId, type: res.type, name: res.name, location: point, heading, progress,
        phase: progress >= 1 ? (j.phase === "outbound" ? "arrived" : "home") : j.phase,
        incidentId: j.incidentId,
      });
    }
    if (progress >= 1 || Date.now() - j.lastPersist > PERSIST_EVERY_MS) await persist(j, point);

    if (progress >= 1) {
      j.done = true;
      if (j.phase === "return") journeys.delete(j.resourceId);
      // outbound units stay "en_route" until the responder confirms ON_SCENE
    }
  }
}

let timer = null;
function startMovement() {
  if (timer) return;
  let running = false;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (err) { console.error("Movement tick error:", err.message); } finally { running = false; }
  }, TICK_MS);
  console.log("Unit movement simulation started");
}
function stopMovement() { clearInterval(timer); timer = null; journeys.clear(); }

module.exports = { startMovement, stopMovement, setIO, tick, measure, positionAt, bearing };
