# PS-9 — Intelligent Emergency Response & Resource Coordination Platform

## 1. Project Overview

**Project Code:** PS-9
**Project Type:** Hackathon MVP
**Application Type:** Full-stack web application
**Primary Goal:** Build a polished, working emergency-response coordination platform that demonstrates a complete end-to-end workflow.

### Product Pitch

> A real-time AI-assisted emergency command platform that turns fragmented reports into coordinated response.

The platform allows citizens to report emergencies, automatically classifies incidents using AI/rules, detects possible duplicate reports, recommends appropriate emergency resources, allows operators to dispatch resources, tracks response status in real time, generates escalation alerts, and records incident data for analytics.

This is a **decision-support prototype**, not an autonomous emergency-response system.

AI recommendations are advisory and require human verification.

---

# 2. Hackathon Objective

The most important objective is to demonstrate a complete working workflow rather than production-scale infrastructure.

The primary demo scenario is:

```text
Citizen Report
      ↓
Incident Created
      ↓
AI Classification
      ↓
Severity + Priority
      ↓
Duplicate Detection
      ↓
Operator Review
      ↓
Resource Recommendation
      ↓
Operator Dispatch
      ↓
Responder Status Updates
      ↓
Real-Time Dashboard Updates
      ↓
Escalation if Delayed
      ↓
Incident Resolution
      ↓
Analytics
```

The entire workflow must work locally and should be reliable enough to demonstrate repeatedly.

---

# 3. Core MVP Features

The MVP must implement the following features.

## 3.1 Citizen Incident Reporting

Citizens can:

* Submit an emergency report
* Select or describe an incident
* Enter a description
* Provide a location
* Use browser geolocation when available
* Manually enter/select a location as fallback
* Optionally attach an image
* Submit anonymously in demo mode
* Receive a tracking/public incident ID
* View basic incident status

Supported incident types:

```text
fire
flood
medical
accident
industrial
structural
other
```

---

# 4. Operator Command Center

The operator dashboard is the most important UI screen.

Operators must be able to:

* View active incidents
* View incident severity
* View priority
* View status
* View incident location
* View AI classification
* View AI confidence
* View AI summary
* View related/duplicate reports
* View recommended resources
* Dispatch resources
* Change incident priority
* Escalate an incident
* Resolve an incident
* View incident timeline
* Monitor live updates
* View alerts
* View key analytics/KPIs

The dashboard should update without requiring a full page refresh.

---

# 5. Responder View

Responders can:

* View assigned incidents
* Accept assignments
* View incident details
* View incident location
* Change status
* Set status to `EN_ROUTE`
* Set status to `ON_SCENE`
* Add response notes
* Mark incident as resolved

The responder workflow is:

```text
ASSIGNED
   ↓
EN_ROUTE
   ↓
ON_SCENE
   ↓
RESOLVED
```

---

# 6. Admin Capabilities

The MVP admin can:

* View system information
* Manage demo resources
* View analytics
* Seed demo data
* Start the Market Fire simulation
* Configure escalation thresholds if implemented in the UI

Advanced enterprise administration is outside the MVP.

---

# 7. Incident State Machine

The primary incident lifecycle is:

```text
REPORTED
    ↓
CLASSIFIED
    ↓
ASSIGNED
    ↓
EN_ROUTE
    ↓
ON_SCENE
    ↓
RESOLVED
    ↓
CLOSED
```

Possible duplicate workflow:

```text
REPORTED
    ↓
DUPLICATE_CANDIDATE
    ↓
MERGED
```

The system must never automatically merge incidents in the MVP.

The operator must confirm a merge.

---

# 8. Severity Levels

The system uses four severity levels:

```text
low
medium
high
critical
```

UI conventions:

```text
critical → red
high     → orange
medium   → yellow
low      → green
```

Do not rely only on color. Severity should also be represented using text/badges/icons.

---

# 9. Priority Levels

The system uses:

```text
P1
P2
P3
P4
```

Suggested interpretation:

```text
P1 → immediate/highest priority
P2 → high priority
P3 → normal priority
P4 → low priority
```

AI can suggest priority, but the operator can override it.

---

# 10. AI-Assisted Triage

The platform uses a hybrid AI architecture.

```text
Incident Description
        ↓
Rule Preprocessing
        ↓
Gemini API
        ↓
Structured JSON
        ↓
Validation
        ↓
Store AI Result
        ↓
Operator Review
```

If Gemini is unavailable:

```text
Gemini unavailable
        ↓
Rule-Based Classifier
        ↓
Continue Incident Workflow
```

The application must not depend completely on Gemini.

The user should receive a clear fallback message such as:

```text
AI unavailable — using automated fallback classification.
```

Do not expose raw API errors to the user.

---

# 11. AI Output

AI classification should produce:

```json
{
  "type": "fire",
  "severity": "critical",
  "priority": "P1",
  "confidence": 0.94,
  "summary": "A potentially critical fire has been reported in a crowded market.",
  "recommendedActions": [
    "Dispatch fire response team",
    "Dispatch ambulance",
    "Notify police/crowd control"
  ]
}
```

The backend must validate AI output before storing it.

Allowed values must be restricted to the predefined categories.

AI must not:

* Invent resource IDs
* Claim an emergency service was contacted
* Automatically dispatch resources
* Automatically merge incidents
* Override an operator
* Make unsupported factual claims about real emergency services

AI output must be clearly labelled as AI-generated.

---

# 12. Rule-Based Fallback

The fallback classifier must work without an external AI API.

Example keyword mappings:

```text
fire, smoke, burning
→ fire

flood, water level, overflow
→ flood

ambulance, injured, unconscious
→ medical

crash, collision, vehicle accident
→ accident

chemical, factory, gas leak
→ industrial

building collapsed, collapse
→ structural
```

Example severity keywords:

```text
critical:
explosion
trapped
collapse
multiple casualties
spreading fire

high:
major fire
serious injury
heavy flooding

medium:
minor accident
localized flooding

low:
small incident
no injury
```

These are demo heuristics only.

They must not be presented as real emergency decision-making rules.

---

# 13. Duplicate Detection

Duplicate detection must be explainable and deterministic.

Use three signals:

```text
Location similarity = 40%
Time similarity     = 20%
Text similarity     = 40%
```

Default duplicate window:

```text
Distance: 300 meters
Time: 10 minutes
```

Example:

```text
Report A:
"Fire at central market near gate 2"

Report B:
"Large fire near central market gate"
```

If the duplicate score reaches:

```text
>= 0.75
```

the system should display:

```text
Possible duplicate incident
```

The operator must be given options such as:

```text
Merge Reports
Keep Separate
```

Never automatically merge reports.

---

# 14. Resource Coordination

The system contains demo emergency resources.

Supported resource categories include:

```text
Fire Teams
Ambulances
Police Units
Rescue Teams
Hospitals
Shelters
```

Resource recommendation must use a deterministic scoring system.

Factors:

```text
Capability match = 50%
Availability     = 25%
Distance         = 25%
```

The system should recommend the top available resources.

Example:

```text
Fire Incident

Required capability:
fire_suppression

↓

Find available resources

↓

Calculate distance

↓

Calculate match score

↓

Return top 3
```

Example response:

```json
[
  {
    "resourceId": "FT-04",
    "matchScore": 94,
    "distanceKm": 2.1,
    "etaMinutes": 6
  },
  {
    "resourceId": "FT-07",
    "matchScore": 81,
    "distanceKm": 4.8,
    "etaMinutes": 11
  }
]
```

The system must never recommend unavailable resources unless explicitly displaying why they are unavailable.

---

# 15. Resource Status

Resources may have statuses such as:

```text
available
assigned
en_route
on_scene
unavailable
```

When a resource is dispatched:

```text
available
    ↓
assigned
```

When the responder begins travelling:

```text
assigned
    ↓
en_route
```

When the responder arrives:

```text
en_route
    ↓
on_scene
```

After incident resolution, the resource can become:

```text
available
```

---

# 16. Geospatial Functionality

The application uses:

* Leaflet
* React-Leaflet
* OpenStreetMap
* MongoDB GeoJSON
* MongoDB `2dsphere` indexes

Incident location format:

```json
{
  "type": "Point",
  "coordinates": [72.58, 23.03]
}
```

Important:

GeoJSON coordinates use:

```text
[longitude, latitude]
```

not:

```text
[latitude, longitude]
```

The map must display:

* Incident markers
* Resource markers
* Incident severity
* Resource type/status
* Incident information on marker click
* Resource information on marker click
* Selected incident center
* Optional route after dispatch

---

# 17. Routing

OSRM may be used for demo routing.

Flow:

```text
Incident location
      +
Resource location
      ↓
OSRM
      ↓
Route + ETA
```

The route is a demo estimate and must not be presented as guaranteed emergency navigation.

If OSRM fails:

```text
Distance
   ↓
Configured average speed
   ↓
Approximate ETA
```

The application must continue functioning.

---

# 18. Real-Time Communication

Use Socket.IO.

Important server events:

```text
incident:created
incident:updated
incident:classified
incident:assigned
incident:resolved
resource:updated
alert:created
```

Important client events:

```text
incident:submit
resource:status
incident:status
alert:acknowledge
```

Example:

```text
Citizen submits report
        ↓
POST /api/v1/incidents
        ↓
MongoDB
        ↓
Socket.IO
        ↓
Operator Dashboard
        ↓
Incident appears without refresh
```

The dashboard should update in real time.

---

# 19. Escalation System

Use simple backend timer/cron logic.

Default example:

```text
P1
↓
2 minutes
↓
Warning alert

P1
↓
5 minutes
↓
Critical escalation
```

Example configuration:

```json
{
  "P1": {
    "warningAfterMinutes": 2,
    "criticalAfterMinutes": 5
  },
  "P2": {
    "warningAfterMinutes": 5,
    "criticalAfterMinutes": 10
  }
}
```

For the hackathon demo, thresholds should be configurable or easy to shorten.

Escalation should occur when an incident remains unassigned.

---

# 20. Alerts

The MVP should use:

* In-app alerts
* Dashboard alert feed
* Socket.IO notifications
* Optional browser notifications

Do not depend on SMS or paid email services.

Alert example:

```json
{
  "incidentId": "INC-10024",
  "type": "delayed_response",
  "severity": "critical",
  "message": "P1 incident has not received a response",
  "acknowledged": false
}
```

Operators should be able to acknowledge alerts.

---

# 21. Analytics

Analytics are based on MongoDB data.

Required metrics:

```text
Active Incidents
Critical Incidents
Resources Deployed
Average Response Time
Pending Alerts
Resolved Today
```

Required analytics:

```text
Incidents by type
Incidents by severity
Incidents by priority
Incidents by status
Average response time
Resolution time
Resource utilization
Hotspots
```

Use Recharts for visualization.

Recommended charts:

```text
1. Incidents by type       → Bar chart
2. Severity distribution   → Pie chart
3. Response time           → Line chart
4. Daily incidents         → Area/Line chart
5. Resource utilization    → Bar chart
```

Avoid excessive decorative charts.

---

# 22. Dashboard Design

The dashboard is the central command-center interface.

Recommended structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ HEADER                                                      │
│ Logo | Active Incidents | Alerts | User                    │
├──────────────┬───────────────────────────┬──────────────────┤
│              │                           │                  │
│ Incident     │                           │ Resource         │
│ List         │         LIVE MAP          │ Panel            │
│              │                           │                  │
│ P1 Fire      │      Incident markers     │ Fire Team 04     │
│ P2 Flood     │      Resource markers     │ Ambulance 12     │
│ P3 Accident  │                           │ Police 03        │
│              │                           │                  │
├──────────────┴───────────────────────────┴──────────────────┤
│ Alert Feed | Response Time | Active | Resolved | Resources  │
└─────────────────────────────────────────────────────────────┘
```

The dashboard should visually feel like an emergency operations center rather than a generic CRUD admin panel.

---

# 23. Dashboard KPI Cards

Display:

```text
Active Incidents
Critical Incidents
Resources Deployed
Average Response Time
Pending Alerts
Resolved Today
```

Numbers should come from the backend/MongoDB rather than being permanently hardcoded.

Demo seed data may be used initially.

---

# 24. Incident Detail

When an operator selects an incident, show:

```text
Incident #INC-10024

Type: Fire
Severity: Critical
Priority: P1
Status: Assigned

Location:
Central Market

AI Confidence:
94%

AI Summary:
Large fire reported...

Reports:
3 related reports

Recommended Resources:
1. Fire Truck FT-04
2. Ambulance AMB-12
3. Police Unit PU-03
```

Actions:

```text
Dispatch
Change Priority
Merge
Escalate
Resolve
```

---

# 25. Required Pages

The React application should contain:

```text
/
├── Login
├── Citizen Report
├── Track Incident
├── Dashboard
├── Incidents
├── Incident Details
├── Resources
├── Alerts
├── Analytics
├── Responder
└── Admin
```

Use React Router for navigation.

Role-based access should determine which pages/actions a user can access.

---

# 26. User Roles

Supported roles:

```text
citizen
responder
operator
admin
hospital
```

Minimum permissions:

### Citizen

Can:

* Submit reports
* Track own/demo incident

### Responder

Can:

* View assigned incidents
* Update assigned incident status
* Add response notes
* Resolve assigned incidents

### Operator

Can:

* View incidents
* Review AI classification
* Modify severity/priority
* Review duplicates
* Dispatch resources
* Escalate incidents
* Resolve incidents
* View alerts

### Admin

Can:

* Manage users/resources
* View analytics
* Seed demo data
* Run demo simulation

### Hospital

Can be represented as a resource/provider role for the MVP.

---

# 27. Authentication

Use:

```text
JWT
+
bcryptjs
+
Role-based authorization
```

Required authentication APIs:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/auth/me
```

Use middleware such as:

```text
requireAuth
requireRole("operator")
```

Do not implement OAuth for the MVP.

---

# 28. Backend Architecture

Use a modular monolith.

Do NOT implement:

* Microservices
* Kafka
* RabbitMQ
* Kubernetes
* Redis cluster
* Separate AI service
* Separate resource service
* Separate analytics service

Backend flow:

```text
Route
  ↓
Controller
  ↓
Service
  ↓
Model
  ↓
MongoDB
```

Business logic belongs in services, not route files.

---

# 29. Backend Technology

Use:

```text
Node.js
Express.js
Mongoose
Socket.IO
JWT
bcryptjs
dotenv
cors
helmet
express-rate-limit
node-cron
axios
uuid
multer
```

Optional:

```text
Cloudinary
```

---

# 30. Frontend Technology

Use:

```text
React.js
Vite
CSS3
React Router
Axios
Socket.IO Client
Leaflet
React-Leaflet
Recharts
Lucide React
```

### Important frontend rule

Do NOT use Tailwind CSS.

Use:

```text
CSS files
CSS Modules
or organized component/page CSS
```

The UI should be attractive and polished without excessive animation.

---

# 31. Database

Use MongoDB Atlas as the only primary database.

Collections:

```text
users
incidents
sourceReports
resources
alerts
analyticsEvents
```

Avoid unnecessary collections.

MongoDB should support GeoJSON and geospatial queries.

Required indexes:

```javascript
incidentSchema.index({ location: "2dsphere" });
resourceSchema.index({ location: "2dsphere" });
```

---

# 32. Core Incident Data

An incident should contain information equivalent to:

```javascript
{
  publicId: "INC-10024",
  type: "fire",
  severity: "critical",
  priority: "P1",
  status: "reported",
  description: "Large fire near central market",
  location: {
    type: "Point",
    coordinates: [72.58, 23.03]
  },
  address: "Central Market",
  ai: {
    classified: true,
    confidence: 0.94,
    summary: "Large fire reported...",
    recommendedActions: [
      "Dispatch fire team",
      "Notify medical team"
    ]
  },
  sourceReports: [],
  assignedResources: [],
  duplicateCandidates: [],
  escalationLevel: 0,
  createdAt: Date,
  updatedAt: Date,
  resolvedAt: null
}
```

The exact Mongoose implementation should be defined in `database-design.md`.

---

# 33. Source Reports

A source report represents an individual report received by the system.

Example:

```javascript
{
  publicId: "REP-10001",
  incidentId: "INC-10024",
  sourceType: "citizen",
  description: "There is a large fire near the market",
  location: {
    type: "Point",
    coordinates: [72.58, 23.03]
  },
  attachmentUrl: null,
  createdAt: Date
}
```

Multiple source reports may belong to one incident.

---

# 34. Demo Data

Use **Ahmedabad** as the synthetic demo city.

Important:

All demo incidents must be clearly synthetic.

Do not present seeded incidents as real emergencies.

Seed at least:

### Users

```text
1 admin
1 operator
2 responders
1 citizen
```

### Resources

```text
5 fire teams
5 ambulances
3 police units
3 rescue teams
3 hospitals
```

### Incidents

```text
3 active incidents
2 resolved incidents
1 duplicate candidate
```

### Alerts

```text
1 warning
1 critical
```

Use realistic but synthetic locations around Ahmedabad.

---

# 35. Demo Mode

The project should contain a dedicated:

```text
Demo Mode
```

The admin/operator should be able to start:

```text
Market Fire Simulation
```

The simulation should demonstrate:

```text
Report 1
↓
Report 2
↓
Duplicate candidate
↓
AI classification
↓
Resource recommendation
↓
Dispatch
↓
Responder status updates
↓
Escalation
↓
Resolution
↓
Analytics
```

Optional API:

```text
POST /api/v1/demo/market-fire
```

Example:

```json
{
  "scenario": "market_fire"
}
```

The simulation should use synthetic data.

---

# 36. Market Fire Demo Scenario

The primary presentation scenario is:

### Citizen A

```text
There is a large fire near the market and people are trapped.
```

### Citizen B

```text
Smoke and fire visible near the same market.
```

The system should:

```text
Receive both reports
        ↓
Classify as FIRE
        ↓
Estimate CRITICAL severity
        ↓
Assign/suggest P1 priority
        ↓
Detect possible duplicate
        ↓
Show duplicate candidate
        ↓
Operator confirms merge
        ↓
Generate AI summary
        ↓
Recommend fire + medical + police resources
        ↓
Operator dispatches resources
        ↓
Responder receives assignment
        ↓
Responder becomes EN_ROUTE
        ↓
Responder becomes ON_SCENE
        ↓
Optional escalation demonstration
        ↓
Responder resolves incident
        ↓
Analytics update
```

---

# 37. Demo Simulation Timing

The simulation may use accelerated timing:

```text
T+00s → Citizen report

T+05s → Second report

T+10s → Duplicate candidate

T+15s → AI classification

T+20s → Resource recommendation

T+30s → Operator dispatch

T+40s → Responder EN_ROUTE

T+60s → Responder ON_SCENE

T+90s → Incident RESOLVED
```

Timing should be configurable.

The simulation must not make the application dependent on real-world emergency services.

---

# 38. Error Handling

Every external service must have a fallback.

### Gemini

```text
Gemini fails
↓
Rule classifier
↓
Continue
```

### OSRM

```text
OSRM fails
↓
Distance calculation
↓
Approximate ETA
↓
Continue
```

### Cloudinary

```text
Cloudinary fails
↓
Continue without image
```

### Map tiles

```text
Map unavailable
↓
Incident list/dashboard remains usable
```

Optional services must never prevent the application from starting.

---

# 39. Security Requirements

Minimum security:

* Store secrets in `.env`
* Never expose API keys in React
* Never commit `.env`
* Use `.env.example`
* Hash passwords with bcryptjs
* Use JWT authentication
* Use role-based authorization
* Configure CORS
* Use Helmet
* Use rate limiting
* Validate incoming requests
* Sanitize user-generated content when displayed
* Never expose MongoDB credentials
* Never expose Gemini API key in frontend

---

# 40. Environment Variables

Backend `.env` should support:

```env
PORT=5000

MONGODB_URI=

JWT_SECRET=

GEMINI_API_KEY=

CLIENT_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Optional services must be able to remain empty.

The backend should still start when optional API keys are missing.

---

# 41. Development Environment

Local development:

```text
React/Vite
http://localhost:5173

Express
http://localhost:5000

MongoDB
MongoDB Atlas
```

Frontend communicates with:

```text
/api/v1
```

Backend health endpoint:

```text
GET /health
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "..."
}
```

---

# 42. Deployment

Recommended:

```text
Frontend → Vercel or Render Static Site
Backend  → Render
Database → MongoDB Atlas
```

The backend must use the platform-provided `PORT`.

Do not claim production emergency-service reliability.

This is a hackathon prototype.

Keep a working local version available for presentation.

---

# 43. Performance Targets

Hackathon targets:

```text
Normal CRUD API        < 1 second

Dashboard update       < 2 seconds

AI response            < 15 seconds

Resource recommendation < 2 seconds

Initial dashboard load  < 3 seconds

Demo concurrent users   5–20
```

These are demonstration targets, not production SLAs.

---

# 44. Accessibility

Minimum requirements:

* Semantic HTML
* Proper form labels
* Keyboard-accessible controls
* Visible focus states
* Sufficient contrast
* Text labels for important states
* Alt text for meaningful images
* Do not communicate severity through color alone

---

# 45. UI Design Direction

The UI should look like a modern emergency operations center.

Design principles:

```text
High visual hierarchy
Strong contrast
Clear severity indicators
Readable typography
Consistent spacing
Large actionable buttons
Clear status badges
Map-centered dashboard
Minimal unnecessary animation
Responsive layout
Desktop-first command center
Mobile-friendly citizen reporting
```

Avoid making the application look like a generic admin dashboard.

Use subtle transitions and polished components, but prioritize functionality.

---

# 46. API Base Path

All application APIs should use:

```text
/api/v1
```

Health endpoint:

```text
/health
```

API response format:

### Success

```json
{
  "success": true,
  "data": {}
}
```

### Error

```json
{
  "success": false,
  "message": "Incident not found",
  "code": "INCIDENT_NOT_FOUND"
}
```

Use consistent error handling across the backend.

---

# 47. Required API Areas

The complete API specification is defined separately in:

```text
docs/api-plan.md
```

The backend must provide functionality for:

```text
Authentication
Incidents
Resources
Alerts
Analytics
Demo Simulation
Health
```

Do not invent unnecessary APIs without a clear requirement.

---

# 48. Code Organization

Backend:

```text
server/
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   ├── sockets/
│   ├── utils/
│   ├── seed/
│   └── app.js
│
├── .env
├── package.json
└── server.js
```

Frontend:

```text
client/
│
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── dashboard/
│   │   ├── incidents/
│   │   ├── resources/
│   │   ├── alerts/
│   │   └── map/
│   │
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   ├── context/
│   ├── utils/
│   ├── styles/
│   ├── App.jsx
│   └── main.jsx
│
├── index.html
├── package.json
└── vite.config.js
```

Keep:

```text
routes
controllers
services
models
```

separated.

---

# 49. Engineering Rules

The implementation must follow these principles:

### Rule 1 — Build the workflow first

Prioritize:

```text
Report
→ Incident
→ Classification
→ Dispatch
→ Status
→ Resolve
```

### Rule 2 — Do not over-engineer

Do not introduce:

```text
Kafka
RabbitMQ
Redis
Kubernetes
Microservices
PostgreSQL
PostGIS
Vector DB
Custom ML training
```

unless explicitly required later.

### Rule 3 — AI must have a fallback

The platform must continue functioning if Gemini is unavailable.

### Rule 4 — External services are optional

The core application must not break if:

```text
Gemini
OSRM
Cloudinary
```

are unavailable.

### Rule 5 — Human remains in control

AI only recommends.

Operators can modify:

```text
type
severity
priority
resource selection
incident merge
```

### Rule 6 — Synthetic demo data only

Do not use real patient/emergency data.

### Rule 7 — Complete end-to-end workflow is more important than advanced infrastructure

A stable working demonstration is the priority.

---

# 50. Development Priority

Implementation should follow this order.

## Priority 1 — Must Work

```text
MongoDB
Express API
React application
Incident creation
Incident CRUD
Dashboard
Resource data
Manual dispatch
Incident status tracking
Authentication
```

## Priority 2 — Differentiators

```text
Socket.IO
AI classification
AI summary
Duplicate detection
Resource recommendation
Map
Escalation
```

## Priority 3 — Polish

```text
Analytics
Responder view
Image upload
OSRM route
Browser notifications
Incident timeline
Advanced filters
Demo simulation
```

## Priority 4 — Optional

```text
Email
SMS
Voice
Computer vision
Multilingual AI
Predictive forecasting
```

Do not sacrifice Priority 1 features to implement Priority 4 features.

---

# 51. Testing Requirements

The system should test:

```text
Authentication
Incident creation
Incident classification
Duplicate detection
Resource recommendation
Resource assignment
Escalation
Resolution
Socket.IO updates
Analytics
```

Minimum test scenarios:

### TC-01

Create valid fire incident.

Expected:

```text
201 Created
```

### TC-02

Create incident without description.

Expected:

```text
400 Bad Request
```

### TC-03

Create nearby incident within duplicate window.

Expected:

```text
Duplicate candidate detected
```

### TC-04

Dispatch unavailable resource.

Expected:

```text
400 or 409
```

### TC-05

Leave P1 incident unassigned.

Expected:

```text
Escalation alert
```

### TC-06

Responder changes status.

Expected:

```text
Dashboard updates through Socket.IO
```

---

# 52. Definition of Done

The MVP is considered complete when:

1. A citizen can submit an incident.
2. The incident is stored in MongoDB.
3. The operator sees the incident without refreshing.
4. AI or fallback rules classify the incident.
5. Severity and priority are displayed.
6. Duplicate candidates can be identified.
7. The operator can review duplicate suggestions.
8. Resources are recommended.
9. The operator can dispatch a resource.
10. A responder can receive the assignment.
11. Responder status changes appear live.
12. Delayed P1 incidents generate escalation alerts.
13. The incident can be resolved.
14. Analytics reflect the completed incident.
15. Demo seed data can populate the system.
16. The Market Fire scenario can be demonstrated from start to finish.
17. The application continues working when optional external services fail.

---

# 53. Responsible AI Statement

The application must clearly communicate:

> AI recommendations are advisory and require human verification.

The platform is not an autonomous emergency authority.

AI output should assist operators with:

```text
Classification
Severity suggestion
Priority suggestion
Summary
Recommended actions
```

Final operational decisions remain with authorized human operators.

---

# 54. Important Implementation Boundary

This project is a **hackathon MVP**.

Do not implement production-grade emergency infrastructure.

The following are explicitly outside the MVP:

```text
Kafka
RabbitMQ
Redis cluster
Kubernetes
Microservices
PostgreSQL/PostGIS
Vector database
Custom ML model training
Real emergency service integration
Real hospital APIs
Real IoT hardware
Automated police/fire dispatch
Blockchain
Native mobile applications
Production-scale infrastructure
Advanced computer vision
Live traffic provider integration
Complex MLOps
Full GDPR/HIPAA certification
```

Future scalability can be discussed in documentation but should not delay the MVP.

---

# 55. Documentation Responsibilities

The project contains five supporting technical documents:

```text
docs/project-overview.md
docs/user-flows.md
docs/api-plan.md
docs/database-design.md
docs/ai-design.md
```

This file is the high-level source of truth.

Detailed implementation information should be maintained in the appropriate document.

### project-overview.md

Contains:

* Product vision
* Architecture
* Features
* Technology stack
* Engineering boundaries
* Definition of done

### user-flows.md

Contains:

* Citizen flow
* Operator flow
* Responder flow
* Admin flow
* Market Fire scenario

### api-plan.md

Contains:

* Endpoints
* HTTP methods
* Request structures
* Response structures
* Authentication
* Error codes

### database-design.md

Contains:

* MongoDB collections
* Mongoose schemas
* Relationships
* GeoJSON
* Indexes
* Seed data

### ai-design.md

Contains:

* Gemini integration
* Prompt structure
* JSON validation
* Rule fallback
* Duplicate detection
* Resource recommendation
* AI failure handling

---

# 56. Final Engineering Principle

> **Build the complete workflow, not the complete infrastructure.**

The target hackathon architecture is:

```text
React
  +
Express
  +
MongoDB
  +
Socket.IO
  +
Gemini + Rules
  +
Leaflet
```

The most important result is a stable end-to-end demonstration:

```text
Citizen
   ↓
Report
   ↓
AI Triage
   ↓
Duplicate Detection
   ↓
Operator
   ↓
Resource Recommendation
   ↓
Dispatch
   ↓
Responder
   ↓
Real-Time Tracking
   ↓
Escalation
   ↓
Resolution
   ↓
Analytics
```

Everything else is secondary.
