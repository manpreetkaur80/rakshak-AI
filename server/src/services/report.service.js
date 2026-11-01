/** Post-incident report (PDF) built from the incident record. */
const PDFDocument = require("pdfkit");
const Incident = require("../models/Incident");

const fmt = (d) => (d ? new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false }) + " IST" : "—");
const mins = (a, b) => (a && b ? Math.max(0, Math.round(((new Date(b) - new Date(a)) / 60000) * 10) / 10) : null);
const show = (v) => (v === null || v === undefined ? "—" : `${v} min`);

async function loadIncident(publicId) {
  return Incident.findOne({ publicId })
    .populate("assignedResources.resourceId", "publicId name type")
    .populate("sourceReports", "publicId sourceType sourceRef description createdAt")
    .populate("resolution.resolvedBy", "name")
    .populate("assignedResponder", "name");
}

/** Key response-time milestones, derived from the timeline. */
function milestones(inc) {
  const tl = inc.timeline || [];
  const firstStatus = (s) => (tl.find((e) => e.metadata && e.metadata.newStatus === s) || {}).timestamp;
  const created = inc.createdAt;
  const dispatched = (tl.find((e) => e.event === "resource_assigned") || {}).timestamp;
  const enRoute = firstStatus("EN_ROUTE");
  const onScene = firstStatus("ON_SCENE");
  const resolved = inc.resolution && inc.resolution.resolvedAt;
  return {
    created, dispatched, enRoute, onScene, resolved,
    toDispatch: mins(created, dispatched), toOnScene: mins(created, onScene), total: mins(created, resolved),
  };
}

function buildPdf(inc, res) {
  const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Incident report ${inc.publicId}`, Author: "RakshakAI" } });
  doc.pipe(res);
  const W = doc.page.width - 96;

  const h = (t) => { doc.moveDown(0.8).fontSize(12).fillColor("#b91c1c").font("Helvetica-Bold").text(t.toUpperCase()); doc.moveTo(48, doc.y + 2).lineTo(48 + W, doc.y + 2).strokeColor("#e5e7eb").stroke(); doc.moveDown(0.5).fillColor("#111827").font("Helvetica").fontSize(10); };
  const kv = (k, v) => { doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(String(v ?? "—")); };

  doc.fontSize(20).fillColor("#111827").font("Helvetica-Bold").text("RakshakAI — Post-Incident Report");
  doc.fontSize(10).font("Helvetica").fillColor("#6b7280").text(`Generated ${fmt(new Date())}`);
  doc.moveDown(0.5).fontSize(14).fillColor("#111827").font("Helvetica-Bold").text(`${inc.publicId} · ${inc.title}`);

  h("Overview");
  kv("Type", inc.type);
  kv("Severity / priority", `${inc.severity} / ${inc.priority}`);
  kv("Final status", inc.status);
  kv("Location", `${inc.address || "—"} (${(inc.location.coordinates || []).slice().reverse().map((n) => n.toFixed(5)).join(", ")})`);
  kv("Reported", fmt(inc.createdAt));
  if (inc.credibility && inc.credibility.level) kv("Report credibility", `${inc.credibility.level} (${Math.round(inc.credibility.score * 100)}%)${inc.credibility.flags.length ? " – " + inc.credibility.flags.join("; ") : ""}`);
  if (inc.autoDispatched) kv("Dispatch", "Automatic (recommended package)");
  doc.moveDown(0.3).text(inc.description, { width: W });

  const m = milestones(inc);
  h("Response times");
  kv("Report → first dispatch", show(m.toDispatch));
  kv("Report → on scene", show(m.toOnScene));
  kv("Report → resolved", show(m.total));

  const ai = inc.aiClassification;
  if (ai && ai.summary) { h("Assessment summary"); doc.text(ai.summary, { width: W }); }

  h(`Units deployed (${inc.assignedResources.length})`);
  if (!inc.assignedResources.length) doc.text("No units were dispatched.");
  inc.assignedResources.forEach((ar) => {
    const r = ar.resourceId || {};
    doc.text(`• ${r.publicId || "?"} ${r.name ? "– " + r.name : ""} (${r.type || "unit"}) — ${ar.status}, assigned ${fmt(ar.assignedAt)}`, { width: W });
  });

  h(`Sources (${inc.sourceReports.length})`);
  inc.sourceReports.forEach((s) => doc.text(`• [${(s.sourceType || "web").toUpperCase()}${s.sourceRef ? " " + s.sourceRef : ""}] ${fmt(s.createdAt)} — ${String(s.description || "").slice(0, 160)}`, { width: W }));

  h("Timeline");
  (inc.timeline || []).forEach((e) => {
    if (doc.y > doc.page.height - 90) doc.addPage();
    doc.text(`${fmt(e.timestamp)}  ${e.message}`, { width: W });
  });

  if (inc.resolution && inc.resolution.resolvedAt) {
    h("Resolution");
    kv("Resolved", fmt(inc.resolution.resolvedAt));
    kv("Resolved by", inc.resolution.resolvedBy && inc.resolution.resolvedBy.name);
    kv("Note", inc.resolution.resolutionNote);
  }
  doc.end();
}

module.exports = { loadIncident, buildPdf, milestones };
