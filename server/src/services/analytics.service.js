const Incident = require("../models/Incident");
const Resource = require("../models/Resource");
const Alert = require("../models/Alert");

/** Inclusive YYYY-MM-DD range → Mongo createdAt filter ({} when no/invalid range). */
function rangeMatch({ from, to } = {}, field = "createdAt") {
  const m = {};
  const parse = (v, endOfDay) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) return null;
    const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const f = parse(from, false);
  const t = parse(to, true);
  if (f) m.$gte = f;
  if (t) m.$lte = t;
  return Object.keys(m).length ? { [field]: m } : {};
}

const ACTIVE_STATUSES = ["REPORTED", "CLASSIFIED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "DUPLICATE_CANDIDATE"];

async function getOverview(range = {}) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    activeIncidents,
    criticalIncidents,
    resourcesDeployed,
    pendingAlerts,
    resolvedToday,
    allIncidentsWithOnScene,
  ] = await Promise.all([
    Incident.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
    Incident.countDocuments({ status: { $in: ACTIVE_STATUSES }, severity: "critical" }),
    Resource.countDocuments({ status: { $in: ["assigned", "en_route", "on_scene"] } }),
    Alert.countDocuments({ isAcknowledged: false }),
    Incident.countDocuments({ status: { $in: ["RESOLVED", "CLOSED"] }, "resolution.resolvedAt": { $gte: startOfDay } }),
    Incident.find({
      status: { $in: ["ON_SCENE", "RESOLVED", "CLOSED"] },
      "timeline.event": "status_changed",
      ...rangeMatch(range),
    }).select("createdAt timeline").lean(),
  ]);

  // Calculate average response time (createdAt → first ON_SCENE event)
  let totalResponseMinutes = 0;
  let responseCount = 0;

  for (const inc of allIncidentsWithOnScene) {
    const onSceneEvent = (inc.timeline || []).find(
      (e) => e.event === "status_changed" && e.metadata && e.metadata.newStatus === "ON_SCENE"
    );
    if (onSceneEvent) {
      const diffMinutes = (new Date(onSceneEvent.timestamp) - new Date(inc.createdAt)) / 60000;
      if (diffMinutes > 0 && diffMinutes < 1440) {
        totalResponseMinutes += diffMinutes;
        responseCount++;
      }
    }
  }

  const averageResponseTimeMinutes =
    responseCount > 0 ? Math.round((totalResponseMinutes / responseCount) * 10) / 10 : 0;

  return {
    activeIncidents,
    criticalIncidents,
    resourcesDeployed,
    averageResponseTimeMinutes,
    pendingAlerts,
    resolvedToday,
  };
}

async function getByType(range = {}) {
  const result = await Incident.aggregate([
    { $match: rangeMatch(range) },
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return result.map((r) => ({ type: r._id, count: r.count }));
}

async function getBySeverity(range = {}) {
  const result = await Incident.aggregate([
    { $match: rangeMatch(range) },
    { $group: { _id: "$severity", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return result.map((r) => ({ severity: r._id, count: r.count }));
}

async function getResponseTime(range = {}) {
  const incidents = await Incident.find({
    status: { $in: ["ON_SCENE", "RESOLVED", "CLOSED"] },
    ...rangeMatch(range),
  }).select("createdAt timeline").lean();

  const daily = {};

  for (const inc of incidents) {
    const onSceneEvent = (inc.timeline || []).find(
      (e) => e.event === "status_changed" && e.metadata && e.metadata.newStatus === "ON_SCENE"
    );
    if (!onSceneEvent) continue;
    const diffMinutes = (new Date(onSceneEvent.timestamp) - new Date(inc.createdAt)) / 60000;
    if (diffMinutes <= 0 || diffMinutes > 1440) continue;

    const date = new Date(inc.createdAt).toISOString().split("T")[0];
    if (!daily[date]) daily[date] = { total: 0, count: 0 };
    daily[date].total += diffMinutes;
    daily[date].count++;
  }

  const dailyArray = Object.entries(daily)
    .map(([date, val]) => ({
      date,
      averageMinutes: Math.round((val.total / val.count) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const totalMinutes = Object.values(daily).reduce((s, v) => s + v.total, 0);
  const totalCount = Object.values(daily).reduce((s, v) => s + v.count, 0);

  return {
    averageMinutes: totalCount > 0 ? Math.round((totalMinutes / totalCount) * 10) / 10 : 0,
    daily: dailyArray,
  };
}

async function getHotspots(range = {}) {
  const incidents = await Incident.find({
    location: { $exists: true },
    ...rangeMatch(range),
  }).select("location type severity").lean();

  // Simple grid clustering: round coordinates to 2 decimal places
  const grid = {};
  for (const inc of incidents) {
    if (!inc.location || !inc.location.coordinates) continue;
    const [lon, lat] = inc.location.coordinates;
    const key = `${Math.round(lat * 100) / 100},${Math.round(lon * 100) / 100}`;
    if (!grid[key]) grid[key] = { latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100, incidentCount: 0 };
    grid[key].incidentCount++;
  }

  return Object.values(grid).sort((a, b) => b.incidentCount - a.incidentCount).slice(0, 20);
}

async function getResourceUtilization() {
  // Hospitals are destinations, not dispatchable units, so they are excluded from utilization
  const rows = await Resource.aggregate([
    { $match: { type: { $ne: "hospital" } } },
    { $group: { _id: { type: "$type", status: "$status" }, count: { $sum: 1 } } },
  ]);
  const BUSY = ["assigned", "en_route", "on_scene"];
  const byTypeMap = {};
  let total = 0, busy = 0, available = 0;
  for (const r of rows) {
    const t = r._id.type;
    byTypeMap[t] = byTypeMap[t] || { type: t, total: 0, busy: 0 };
    byTypeMap[t].total += r.count;
    total += r.count;
    if (BUSY.includes(r._id.status)) { byTypeMap[t].busy += r.count; busy += r.count; }
    if (r._id.status === "available") available += r.count;
  }
  const pct = (b, t) => (t ? Math.round((b / t) * 1000) / 10 : 0);
  return {
    total,
    available,
    deployed: busy,
    utilizationPercent: pct(busy, total),
    byType: Object.values(byTypeMap).map((t) => ({ ...t, utilizationPercent: pct(t.busy, t.total) })).sort((a, b) => a.type.localeCompare(b.type)),
  };
}

// ── Resource shortage prediction ─────────────────────────────────────────────
const { RESPONSE_PACKAGE } = require("./resource.service");
const AnalyticsEvent = require("../models/AnalyticsEvent");

const FORECAST_DAYS = 14;
const DEFAULT_DURATION_MIN = 45;

/** units of each resource type needed by one incident of the given type/severity */
function slotsFor(incidentType, severity) {
  const out = {};
  for (const slot of RESPONSE_PACKAGE[incidentType] || RESPONSE_PACKAGE.other) out[slot.type] = (out[slot.type] || 0) + 1;
  if (severity === "critical") {
    const lead = (RESPONSE_PACKAGE[incidentType] || RESPONSE_PACKAGE.other)[0];
    if (lead) out[lead.type] = (out[lead.type] || 0) + 1;
  }
  return out;
}

const riskOf = (shortfall, demand, available) => {
  if (shortfall > 0) return "high";
  if (available > 0 && demand >= 0.7 * available) return "medium";
  return "low";
};

/**
 * Forecast = units still needed by incidents that have no units yet
 *          + expected new concurrent demand (arrival rate × typical duration, Little's law).
 * The arrival rate is the larger of the 14-day average and the last-6-hour rate, so a sudden surge counts.
 */
async function getShortages(now = new Date()) {
  const since = new Date(now.getTime() - FORECAST_DAYS * 24 * 3600 * 1000);
  const recentSince = new Date(now.getTime() - 6 * 3600 * 1000);

  const [fleet, history, active] = await Promise.all([
    Resource.find({ type: { $ne: "hospital" } }).select("type status").lean(),
    Incident.find({ createdAt: { $gte: since }, status: { $ne: "MERGED" } }).select("type severity createdAt resolution.resolvedAt").lean(),
    Incident.find({ status: { $in: ["REPORTED", "CLASSIFIED", "DUPLICATE_CANDIDATE"] }, "assignedResources.0": { $exists: false } }).select("type severity").lean(),
  ]);

  const types = [...new Set(fleet.map((r) => r.type))].sort();
  const BUSY = ["assigned", "en_route", "on_scene"];
  const stock = {};
  for (const t of types) stock[t] = { type: t, total: 0, available: 0, busy: 0 };
  for (const r of fleet) {
    stock[r.type].total++;
    if (r.status === "available") stock[r.type].available++;
    if (BUSY.includes(r.status)) stock[r.type].busy++;
  }

  const durations = history.filter((i) => i.resolution && i.resolution.resolvedAt).map((i) => (new Date(i.resolution.resolvedAt) - new Date(i.createdAt)) / 60000).filter((m) => m > 0 && m < 1440);
  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : DEFAULT_DURATION_MIN;
  const duration = Math.min(240, Math.max(10, avgDuration));

  // per incident type: arrival rate per hour
  const rate = {};
  for (const i of history) {
    rate[i.type] = rate[i.type] || { all: 0, recent: 0, severities: {} };
    rate[i.type].all++;
    if (new Date(i.createdAt) >= recentSince) rate[i.type].recent++;
  }

  const demandNew = {};
  for (const [incType, c] of Object.entries(rate)) {
    const perHour = Math.max(c.all / (FORECAST_DAYS * 24), c.recent / 6);
    const concurrent = (perHour * duration) / 60;
    for (const [resType, n] of Object.entries(slotsFor(incType, "high"))) demandNew[resType] = (demandNew[resType] || 0) + concurrent * n;
  }
  const demandPending = {};
  for (const i of active) {
    for (const [resType, n] of Object.entries(slotsFor(i.type, i.severity))) demandPending[resType] = (demandPending[resType] || 0) + n;
  }

  const round1 = (n) => Math.round(n * 10) / 10;
  const forecast = types.map((t) => {
    const demand = (demandNew[t] || 0) + (demandPending[t] || 0);
    const shortfall = Math.max(0, Math.ceil(round1(demand) - stock[t].available - 1e-9));
    return {
      type: t,
      expectedDemand: round1(demand),
      pendingNeed: demandPending[t] || 0,
      available: stock[t].available,
      shortfall,
      risk: riskOf(shortfall, demand, stock[t].available),
    };
  });

  const current = types.map((t) => {
    const s = stock[t];
    const util = s.total ? Math.round((s.busy / s.total) * 1000) / 10 : 0;
    return { ...s, utilizationPercent: util, risk: util >= 85 || s.available === 0 ? "high" : util >= 70 ? "medium" : "low" };
  });

  const events = await AnalyticsEvent.aggregate([
    { $match: { eventType: "resource_shortage" } },
    { $group: { _id: "$metadata.resourceType", count: { $sum: 1 }, lastAt: { $max: "$timestamp" } } },
    { $sort: { count: -1 } },
  ]);

  return {
    generatedAt: now,
    basis: { days: FORECAST_DAYS, incidentsConsidered: history.length, avgDurationMinutes: Math.round(duration) },
    current,
    forecast,
    events: events.filter((e) => e._id).map((e) => ({ type: e._id, count: e.count, lastAt: e.lastAt })),
  };
}

// ── CSV export ───────────────────────────────────────────────────────────────
// Cells that start with = + - @ are prefixed so spreadsheet apps never run them as formulas.
function csvCell(v) {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportIncidentsCsv(range = {}) {
  const incidents = await Incident.find(rangeMatch(range)).sort({ createdAt: 1 }).populate("sourceReports", "sourceType").lean();
  const header = ["incident_id", "created_at", "type", "severity", "priority", "status", "address", "latitude", "longitude",
    "reports", "sources", "units_assigned", "first_assigned_at", "on_scene_at", "resolved_at", "response_minutes", "escalation_level"];
  const rows = incidents.map((i) => {
    const tl = i.timeline || [];
    const firstAssigned = tl.find((e) => e.event === "resource_assigned");
    const onScene = tl.find((e) => e.event === "status_changed" && e.metadata && e.metadata.newStatus === "ON_SCENE");
    const resp = onScene ? Math.round(((new Date(onScene.timestamp) - new Date(i.createdAt)) / 60000) * 10) / 10 : "";
    const sources = [...new Set((i.sourceReports || []).map((r) => r.sourceType))].join("|");
    return [
      i.publicId, i.createdAt, i.type, i.severity, i.priority, i.status, i.address,
      i.location && i.location.coordinates ? i.location.coordinates[1] : "", i.location && i.location.coordinates ? i.location.coordinates[0] : "",
      (i.sourceReports || []).length, sources, (i.assignedResources || []).length,
      firstAssigned ? firstAssigned.timestamp : "", onScene ? onScene.timestamp : "", i.resolution && i.resolution.resolvedAt ? i.resolution.resolvedAt : "", resp,
      i.escalation && i.escalation.level ? i.escalation.level : "",
    ];
  });
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

module.exports = { rangeMatch, getShortages, exportIncidentsCsv, csvCell, getResourceUtilization, getOverview, getByType, getBySeverity, getResponseTime, getHotspots };
