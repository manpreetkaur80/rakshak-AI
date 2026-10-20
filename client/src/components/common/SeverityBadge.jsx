export default function SeverityBadge({ severity, size = "sm" }) {
  if (!severity) return null;
  const s = severity.toLowerCase();
  return (
    <span className={`badge badge-${s}`} style={{ fontSize: size === "sm" ? "11px" : "12px" }}>
      {s === "critical" ? "🔴" : s === "high" ? "🟠" : s === "medium" ? "🟡" : "🟢"} {s.toUpperCase()}
    </span>
  );
}
