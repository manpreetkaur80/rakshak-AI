const Incident = require("../models/Incident");
const Resource = require("../models/Resource");
const Alert = require("../models/Alert");

const ACTIVE_STATUSES = ["REPORTED", "CLASSIFIED", "ASSIGNED", "EN_ROUTE", "ON_SCENE", "DUPLICATE_CANDIDATE"];

async function getOverview() {
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
    Incident.countDocuments({ status: "RESOLVED", "resolution.resolvedAt": { $gte: startOfDay } }),
    Incident.find({
      status: { $in: ["ON_SCENE", "RESOLVED", "CLOSED"] },
      "timeline.event": "status_changed",
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

async function getByType() {
  const result = await Incident.aggregate([
    { $group: { _id: "$type", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return result.map((r) => ({ type: r._id, count: r.count }));
}

async function getBySeverity() {
  const result = await Incident.aggregate([
    { $group: { _id: "$severity", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  return result.map((r) => ({ severity: r._id, count: r.count }));
}

async function getResponseTime() {
  const incidents = await Incident.find({
    status: { $in: ["ON_SCENE", "RESOLVED", "CLOSED"] },
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

async function getHotspots() {
  const incidents = await Incident.find({
    location: { $exists: true },
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

module.exports = { getOverview, getByType, getBySeverity, getResponseTime, getHotspots };
