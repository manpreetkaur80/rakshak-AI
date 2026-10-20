const STATUS_LABELS = {
  REPORTED: "Reported",
  CLASSIFIED: "Classified",
  ASSIGNED: "Assigned",
  EN_ROUTE: "En Route",
  ON_SCENE: "On Scene",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  DUPLICATE_CANDIDATE: "Duplicate?",
  MERGED: "Merged",
};

export default function StatusBadge({ status }) {
  if (!status) return null;
  return (
    <span className={`badge badge-${status}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
