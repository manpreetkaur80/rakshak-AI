/**
 * Seed script for PS-9 demo data
 * Run: npm run seed
 * All data is synthetic — Ahmedabad demo locations
 */

require("dotenv").config({ path: require("path").join(__dirname, "../../.env") });
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Resource = require("../models/Resource");
const Incident = require("../models/Incident");
const SourceReport = require("../models/SourceReport");
const Alert = require("../models/Alert");
const AnalyticsEvent = require("../models/AnalyticsEvent");

// ── Synthetic Ahmedabad coordinates ──────────────────────────────────────────
// All clearly demo/synthetic locations
const LOCATIONS = {
  marketArea:     [72.5714, 23.0225],
  sgHighway:      [72.5080, 23.0300],
  riverfront:     [72.5833, 23.0200],
  industrialArea: [72.5500, 23.0800],
  maninagar:      [72.6010, 23.0000],
  navrangpura:    [72.5560, 23.0340],
  sabarmatiBank:  [72.5740, 23.0680],
  thaltej:        [72.5120, 23.0520],
  satellite:      [72.5220, 23.0260],
  ctm:            [72.6310, 23.0130],
  // Fire stations / resource bases
  fireStation1:   [72.5800, 23.0350],
  fireStation2:   [72.5400, 23.0450],
  hospital1:      [72.5750, 23.0280],
  hospital2:      [72.5300, 23.0600],
  policeStation1: [72.5650, 23.0150],
};

// ── Users ─────────────────────────────────────────────────────────────────────
const USERS = [
  { name: "Admin User", email: "admin@ps9demo.com", password: "admin123", role: "admin" },
  { name: "Operator Priya", email: "operator@ps9demo.com", password: "operator123", role: "operator" },
  { name: "Responder Arjun", email: "responder1@ps9demo.com", password: "responder123", role: "responder" },
  { name: "Responder Meera", email: "responder2@ps9demo.com", password: "responder123", role: "responder" },
  { name: "Citizen Raj", email: "citizen@ps9demo.com", password: "citizen123", role: "citizen" },
  { name: "Hospital Admin", email: "hospital@ps9demo.com", password: "hospital123", role: "hospital" },
];

// ── Resources ─────────────────────────────────────────────────────────────────
const RESOURCES = [
  // Fire teams
  { publicId: "FT-01", name: "Fire Response Team 01", type: "fire_team", capabilities: ["fire_suppression", "rescue", "hazmat"], location: LOCATIONS.fireStation1, status: "available" },
  { publicId: "FT-02", name: "Fire Response Team 02", type: "fire_team", capabilities: ["fire_suppression", "rescue"], location: LOCATIONS.fireStation2, status: "available" },
  { publicId: "FT-03", name: "Fire Response Team 03", type: "fire_team", capabilities: ["fire_suppression", "rescue", "hazmat"], location: LOCATIONS.sgHighway, status: "available" },
  { publicId: "FT-04", name: "Fire Response Team 04", type: "fire_team", capabilities: ["fire_suppression", "rescue"], location: LOCATIONS.marketArea, status: "available" },
  { publicId: "FT-05", name: "Fire Response Team 05", type: "fire_team", capabilities: ["fire_suppression"], location: LOCATIONS.navrangpura, status: "available" },
  // Ambulances
  { publicId: "AMB-01", name: "Ambulance Unit 01", type: "ambulance", capabilities: ["medical", "trauma", "transport"], location: LOCATIONS.hospital1, status: "available" },
  { publicId: "AMB-02", name: "Ambulance Unit 02", type: "ambulance", capabilities: ["medical", "trauma", "transport"], location: LOCATIONS.marketArea, status: "available" },
  { publicId: "AMB-03", name: "Ambulance Unit 03", type: "ambulance", capabilities: ["medical", "transport"], location: LOCATIONS.hospital2, status: "available" },
  { publicId: "AMB-04", name: "Ambulance Unit 04", type: "ambulance", capabilities: ["medical", "trauma"], location: LOCATIONS.sgHighway, status: "available" },
  { publicId: "AMB-05", name: "Ambulance Unit 05", type: "ambulance", capabilities: ["medical", "transport"], location: LOCATIONS.maninagar, status: "available" },
  // Police units
  { publicId: "PU-01", name: "Police Unit 01", type: "police", capabilities: ["traffic_control", "crowd_control", "security"], location: LOCATIONS.policeStation1, status: "available" },
  { publicId: "PU-02", name: "Police Unit 02", type: "police", capabilities: ["traffic_control", "security"], location: LOCATIONS.sgHighway, status: "available" },
  { publicId: "PU-03", name: "Police Unit 03", type: "police", capabilities: ["crowd_control", "security"], location: LOCATIONS.marketArea, status: "available" },
  // Rescue units
  { publicId: "RST-01", name: "Rescue Team 01", type: "rescue", capabilities: ["search_rescue", "structural_rescue", "rescue"], location: LOCATIONS.riverfront, status: "available" },
  { publicId: "RST-02", name: "Rescue Team 02", type: "rescue", capabilities: ["search_rescue", "rescue"], location: LOCATIONS.sabarmatiBank, status: "available" },
  { publicId: "RST-03", name: "Rescue Team 03", type: "rescue", capabilities: ["search_rescue", "structural_rescue"], location: LOCATIONS.thaltej, status: "available" },
  // Hospitals
  { publicId: "HOS-01", name: "Demo General Hospital", type: "hospital", capabilities: ["emergency", "trauma", "critical_care"], location: LOCATIONS.hospital1, status: "available" },
  { publicId: "HOS-02", name: "Demo City Hospital", type: "hospital", capabilities: ["emergency", "trauma"], location: LOCATIONS.hospital2, status: "available" },
  { publicId: "HOS-03", name: "Demo Medical Centre", type: "hospital", capabilities: ["emergency", "critical_care"], location: LOCATIONS.satellite, status: "available" },
];

// ── Seed function ─────────────────────────────────────────────────────────────
async function seedResources() {
  const count = await Resource.countDocuments();
  if (count > 0) {
    console.log(`Resources already exist (${count}), skipping resource seed`);
    return;
  }
  const docs = RESOURCES.map((r) => ({
    publicId: r.publicId,
    name: r.name,
    type: r.type,
    capabilities: r.capabilities,
    status: r.status,
    location: { type: "Point", coordinates: r.location },
    baseLocation: { type: "Point", coordinates: r.location },
    availability: { isAvailable: r.status === "available", lastUpdated: new Date() },
    contact: { phone: `demo-${r.publicId}`, radioChannel: `CH-${r.publicId}` },
    capacity: r.type === "hospital" ? { personnel: 25, patients: 10 } : { personnel: 6, patients: 0 },
    metadata: { isDemo: true },
  }));

  await Resource.insertMany(docs, { ordered: false }).catch(() => {});
  console.log(`✓ Seeded ${docs.length} resources`);
}

async function runFullSeed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("MongoDB connected for seed");

  // ── Users ──────────────────────────────────────────────────────────────────
  const userMap = {};
  for (const u of USERS) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      const passwordHash = await bcrypt.hash(u.password, 12);
      const count = await User.countDocuments();
      user = await User.create({
        publicId: `USR-${String(10001 + count).padStart(5, "0")}`,
        name: u.name,
        email: u.email,
        passwordHash,
        role: u.role,
        isActive: true,
      });
      console.log(`✓ Created user: ${u.email} (${u.role})`);
    } else {
      console.log(`  User exists: ${u.email}`);
    }
    userMap[u.role] = user;
  }

  // ── Resources ──────────────────────────────────────────────────────────────
  await seedResources();

  // ── Incidents ─────────────────────────────────────────────────────────────
  const existingCount = await Incident.countDocuments({ isDemo: true });
  if (existingCount >= 3) {
    console.log(`Demo incidents already seeded (${existingCount})`);
  } else {
    const now = new Date();
    const operator = userMap["operator"] || await User.findOne({ role: "operator" });
    const citizen = userMap["citizen"] || await User.findOne({ role: "citizen" });
    const responder1 = userMap["responder"] || await User.findOne({ role: "responder" });

    // Find resources for assignment
    const ft01 = await Resource.findOne({ publicId: "FT-01" });
    const amb01 = await Resource.findOne({ publicId: "AMB-01" });
    const rst01 = await Resource.findOne({ publicId: "RST-01" });

    const incidentDefs = [
      {
        publicId: "INC-10001",
        type: "fire",
        severity: "critical",
        priority: "P1",
        status: "ASSIGNED",
        title: "Fire at Synthetic Market Area (DEMO)",
        description: "Large fire reported near the synthetic market. Heavy smoke and possible trapped persons.",
        location: { type: "Point", coordinates: LOCATIONS.marketArea },
        address: "Synthetic Market Road, Ahmedabad",
        aiClassification: {
          type: "fire", severity: "critical", priority: "P1", confidence: 0.94,
          summary: "Multiple reports indicate a spreading fire near a crowded market with possible trapped civilians.",
          recommendedActions: ["Dispatch fire response team", "Request medical support", "Check for trapped civilians"],
          provider: "rules", isFallback: false, classifiedAt: new Date(now - 20 * 60000),
        },
        timeline: [
          { event: "incident_created", message: "DEMO: Emergency report received", timestamp: new Date(now - 25 * 60000) },
          { event: "classified", message: "DEMO: Classified as critical fire", timestamp: new Date(now - 24 * 60000), metadata: { newStatus: "CLASSIFIED" } },
          { event: "resource_assigned", message: "DEMO: Fire Team 01 and Ambulance 01 assigned", timestamp: new Date(now - 20 * 60000), metadata: { newStatus: "ASSIGNED" } },
        ],
        assignedResources: ft01 && amb01 ? [
          { resourceId: ft01._id, assignedAt: new Date(now - 20 * 60000), assignedBy: operator?._id, status: "on_scene" },
          { resourceId: amb01._id, assignedAt: new Date(now - 20 * 60000), assignedBy: operator?._id, status: "on_scene" },
        ] : [],
        createdBy: citizen?._id,
      },
      {
        publicId: "INC-10002",
        type: "flood",
        severity: "high",
        priority: "P2",
        status: "EN_ROUTE",
        title: "Flooding near Sabarmati Riverfront (DEMO)",
        description: "Water overflowing near the synthetic riverfront area. Several vehicles stranded.",
        location: { type: "Point", coordinates: LOCATIONS.riverfront },
        address: "Synthetic Riverfront Road, Ahmedabad",
        aiClassification: {
          type: "flood", severity: "high", priority: "P2", confidence: 0.87,
          summary: "Significant flooding reported near the riverfront with stranded vehicles.",
          recommendedActions: ["Dispatch rescue team", "Alert downstream areas", "Establish evacuation routes"],
          provider: "rules", isFallback: true, classifiedAt: new Date(now - 10 * 60000),
        },
        timeline: [
          { event: "incident_created", message: "DEMO: Flood report received", timestamp: new Date(now - 15 * 60000) },
          { event: "classified", message: "DEMO: Classified as high severity flood", timestamp: new Date(now - 14 * 60000), metadata: { newStatus: "CLASSIFIED" } },
          { event: "resource_assigned", message: "DEMO: Rescue Team 01 assigned", timestamp: new Date(now - 10 * 60000), metadata: { newStatus: "ASSIGNED" } },
          { event: "status_changed", message: "DEMO: Responder en route", timestamp: new Date(now - 8 * 60000), metadata: { newStatus: "EN_ROUTE" } },
        ],
        assignedResources: rst01 ? [
          { resourceId: rst01._id, assignedAt: new Date(now - 10 * 60000), assignedBy: operator?._id, status: "en_route" },
        ] : [],
        createdBy: citizen?._id,
      },
      {
        publicId: "INC-10003",
        type: "accident",
        severity: "medium",
        priority: "P3",
        status: "CLASSIFIED",
        title: "Vehicle Accident on SG Highway (DEMO)",
        description: "Multi-vehicle collision on SG Highway. Minor injuries reported. Traffic blocked.",
        location: { type: "Point", coordinates: LOCATIONS.sgHighway },
        address: "SG Highway, Ahmedabad",
        aiClassification: {
          type: "accident", severity: "medium", priority: "P3", confidence: 0.82,
          summary: "Multi-vehicle accident with minor injuries and traffic disruption.",
          recommendedActions: ["Dispatch ambulance and police", "Secure accident scene", "Control traffic flow"],
          provider: "rules", isFallback: true, classifiedAt: new Date(now - 5 * 60000),
        },
        timeline: [
          { event: "incident_created", message: "DEMO: Accident report received", timestamp: new Date(now - 7 * 60000) },
          { event: "classified", message: "DEMO: Classified as medium severity accident", timestamp: new Date(now - 5 * 60000), metadata: { newStatus: "CLASSIFIED" } },
        ],
        createdBy: citizen?._id,
      },
      // Resolved incidents
      {
        publicId: "INC-10004",
        type: "medical",
        severity: "high",
        priority: "P2",
        status: "RESOLVED",
        title: "Medical Emergency at Maninagar (DEMO)",
        description: "Person collapsed at demo location. Cardiac emergency suspected.",
        location: { type: "Point", coordinates: LOCATIONS.maninagar },
        address: "Maninagar, Ahmedabad",
        aiClassification: {
          type: "medical", severity: "high", priority: "P2", confidence: 0.91,
          summary: "Suspected cardiac emergency requiring immediate medical attention.",
          recommendedActions: ["Dispatch ambulance", "Notify nearest hospital"],
          provider: "rules", isFallback: true, classifiedAt: new Date(now - 60 * 60000),
        },
        timeline: [
          { event: "incident_created", message: "DEMO: Medical emergency reported", timestamp: new Date(now - 90 * 60000) },
          { event: "classified", message: "DEMO: Classified as high severity medical", timestamp: new Date(now - 88 * 60000), metadata: { newStatus: "CLASSIFIED" } },
          { event: "resource_assigned", message: "DEMO: AMB-05 assigned", timestamp: new Date(now - 85 * 60000), metadata: { newStatus: "ASSIGNED" } },
          { event: "status_changed", message: "DEMO: Responder en route", timestamp: new Date(now - 80 * 60000), metadata: { newStatus: "EN_ROUTE" } },
          { event: "status_changed", message: "DEMO: Responder on scene", timestamp: new Date(now - 72 * 60000), metadata: { newStatus: "ON_SCENE" } },
          { event: "resolved", message: "DEMO: Patient stabilized and transported", timestamp: new Date(now - 60 * 60000), metadata: { newStatus: "RESOLVED" } },
        ],
        resolution: { resolvedAt: new Date(now - 60 * 60000), resolvedBy: operator?._id, resolutionNote: "DEMO: Patient stabilized and transported to hospital." },
        createdBy: citizen?._id,
      },
      {
        publicId: "INC-10005",
        type: "industrial",
        severity: "high",
        priority: "P2",
        status: "RESOLVED",
        title: "Gas Leak at Synthetic Industrial Area (DEMO)",
        description: "Minor gas leak detected at synthetic factory. Area evacuated.",
        location: { type: "Point", coordinates: LOCATIONS.industrialArea },
        address: "Synthetic Industrial Area, Ahmedabad",
        aiClassification: {
          type: "industrial", severity: "high", priority: "P2", confidence: 0.88,
          summary: "Industrial gas leak requiring hazmat response and area evacuation.",
          recommendedActions: ["Dispatch hazmat team", "Evacuate nearby area"],
          provider: "rules", isFallback: true, classifiedAt: new Date(now - 120 * 60000),
        },
        timeline: [
          { event: "incident_created", message: "DEMO: Industrial incident reported", timestamp: new Date(now - 150 * 60000) },
          { event: "classified", message: "DEMO: Classified as industrial incident", timestamp: new Date(now - 148 * 60000) },
          { event: "resolved", message: "DEMO: Gas leak contained", timestamp: new Date(now - 120 * 60000), metadata: { newStatus: "RESOLVED" } },
        ],
        resolution: { resolvedAt: new Date(now - 120 * 60000), resolvedBy: operator?._id, resolutionNote: "DEMO: Gas leak contained and area declared safe." },
        createdBy: citizen?._id,
      },
      // Duplicate candidate
      {
        publicId: "INC-10006",
        type: "fire",
        severity: "critical",
        priority: "P1",
        status: "DUPLICATE_CANDIDATE",
        title: "Possible Duplicate Fire Near Market (DEMO)",
        description: "Smoke and flames visible near the market area.",
        location: { type: "Point", coordinates: [LOCATIONS.marketArea[0] + 0.001, LOCATIONS.marketArea[1] + 0.001] },
        address: "Near Synthetic Market, Ahmedabad",
        aiClassification: {
          type: "fire", severity: "critical", priority: "P1", confidence: 0.89,
          summary: "Fire report that may be related to an existing incident nearby.",
          recommendedActions: ["Verify with existing incident", "Dispatch if separate"],
          provider: "rules", isFallback: true, classifiedAt: new Date(now - 22 * 60000),
        },
        duplicateCandidates: [],
        timeline: [
          { event: "incident_created", message: "DEMO: Second fire report received", timestamp: new Date(now - 23 * 60000) },
          { event: "duplicate_detected", message: "DEMO: Possible duplicate of INC-10001 detected", timestamp: new Date(now - 22 * 60000) },
        ],
        createdBy: citizen?._id,
      },
    ];

    for (const def of incidentDefs) {
      const exists = await Incident.findOne({ publicId: def.publicId });
      if (!exists) {
        await Incident.create({ ...def, isDemo: true });
        console.log(`✓ Created incident: ${def.publicId}`);
      } else {
        console.log(`  Incident exists: ${def.publicId}`);
      }
    }

    // Link INC-10001 duplicate candidate
    const inc10001 = await Incident.findOne({ publicId: "INC-10001" });
    const inc10006 = await Incident.findOne({ publicId: "INC-10006" });
    if (inc10001 && inc10006 && inc10006.duplicateCandidates.length === 0) {
      inc10006.duplicateCandidates.push({
        incidentId: inc10001._id,
        score: 0.86,
        locationScore: 0.92,
        timeScore: 0.80,
        textScore: 0.84,
        status: "pending",
        detectedAt: new Date(now - 22 * 60000),
      });
      await inc10006.save();
    }

    // Update resources that are assigned to incidents
    if (ft01) await Resource.findByIdAndUpdate(ft01._id, { status: "on_scene", currentIncident: inc10001?._id, "availability.isAvailable": false });
    if (amb01) await Resource.findByIdAndUpdate(amb01._id, { status: "on_scene", currentIncident: inc10001?._id, "availability.isAvailable": false });
    if (rst01) await Resource.findByIdAndUpdate(rst01._id, { status: "en_route", currentIncident: (await Incident.findOne({ publicId: "INC-10002" }))?._id, "availability.isAvailable": false });
  }

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const existingAlerts = await Alert.countDocuments({ type: { $in: ["escalation_warning", "escalation_critical"] } });
  if (existingAlerts === 0) {
    const inc10001 = await Incident.findOne({ publicId: "INC-10001" });
    const inc10003 = await Incident.findOne({ publicId: "INC-10003" });

    if (inc10001) {
      await Alert.create({
        publicId: "ALT-10001",
        type: "escalation_warning",
        severity: "warning",
        title: "P1 Incident Delayed Response (DEMO)",
        message: "DEMO: P1 fire incident INC-10001 has not received responder confirmation after 5 minutes.",
        incidentId: inc10001._id,
        recipientRole: "operator",
        isAcknowledged: false,
      });
      console.log("✓ Created warning alert");
    }

    if (inc10003) {
      await Alert.create({
        publicId: "ALT-10002",
        type: "escalation_critical",
        severity: "critical",
        title: "CRITICAL — P3 Incident Unassigned (DEMO)",
        message: "DEMO: P3 accident incident INC-10003 has been unassigned for over 10 minutes.",
        incidentId: inc10003._id,
        recipientRole: "operator",
        isAcknowledged: false,
      });
      console.log("✓ Created critical alert");
    }
  }

  // ── Analytics events ───────────────────────────────────────────────────────
  const eventCount = await AnalyticsEvent.countDocuments();
  if (eventCount < 5) {
    const now = new Date();
    const incidents = await Incident.find({ isDemo: true }).limit(6);
    for (const inc of incidents) {
      await AnalyticsEvent.create({
        eventType: "incident_created",
        incidentId: inc._id,
        metadata: { type: inc.type, severity: inc.severity, priority: inc.priority, isDemo: true },
        timestamp: inc.createdAt || now,
      });
      if (inc.status === "RESOLVED") {
        await AnalyticsEvent.create({
          eventType: "incident_resolved",
          incidentId: inc._id,
          metadata: { isDemo: true },
          timestamp: inc.resolution?.resolvedAt || now,
        });
      }
    }
    console.log("✓ Created analytics events");
  }

  console.log("\n✅ Seed complete!\n");
  console.log("Demo credentials:");
  console.log("  Admin:    admin@ps9demo.com / admin123");
  console.log("  Operator: operator@ps9demo.com / operator123");
  console.log("  Responder: responder1@ps9demo.com / responder123");
  console.log("  Citizen:  citizen@ps9demo.com / citizen123\n");

  await mongoose.disconnect();
}

// Run if called directly
if (require.main === module) {
  runFullSeed().catch((err) => {
    console.error("Seed error:", err.message);
    process.exit(1);
  });
}

module.exports = { seedResources, runFullSeed };
