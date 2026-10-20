export const SEVERITY_COLORS = {
  critical: "#dc2626",
  high: "#ea580c",
  medium: "#ca8a04",
  low: "#16a34a",
};

export const SEVERITY_BG = {
  critical: "#fef2f2",
  high: "#fff7ed",
  medium: "#fefce8",
  low: "#f0fdf4",
};

export const STATUS_COLORS = {
  REPORTED: "#6366f1",
  CLASSIFIED: "#8b5cf6",
  ASSIGNED: "#3b82f6",
  EN_ROUTE: "#f59e0b",
  ON_SCENE: "#10b981",
  RESOLVED: "#22c55e",
  CLOSED: "#6b7280",
  DUPLICATE_CANDIDATE: "#f97316",
  MERGED: "#a855f7",
};

export const TYPE_ICONS = {
  fire: "🔥",
  flood: "🌊",
  medical: "🚑",
  accident: "🚗",
  industrial: "🏭",
  structural: "🏗️",
  other: "⚠️",
};

export const RESOURCE_ICONS = {
  fire_team: "🚒",
  ambulance: "🚑",
  police: "🚓",
  rescue: "🛟",
  hospital: "🏥",
};

export function formatTimeAgo(date) {
  if (!date) return "—";
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

export function formatDateTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export function formatTime(date) {
  if (!date) return "—";
  return new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function severityBadgeStyle(severity) {
  return {
    backgroundColor: SEVERITY_BG[severity] || "#f3f4f6",
    color: SEVERITY_COLORS[severity] || "#374151",
    border: `1px solid ${SEVERITY_COLORS[severity] || "#d1d5db"}`,
  };
}

export function statusBadgeStyle(status) {
  const color = STATUS_COLORS[status] || "#6b7280";
  return {
    backgroundColor: color + "20",
    color,
    border: `1px solid ${color}40`,
  };
}

export function getErrorMessage(err) {
  return err?.response?.data?.message || err?.message || "An unexpected error occurred";
}
