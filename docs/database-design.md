# PS-9 — Database Design

## 1. Purpose

This document defines the MongoDB database architecture for the PS-9 Intelligent Emergency Response & Resource Coordination Platform.

The database must support:

* Citizen emergency reports
* Unified incidents
* Duplicate detection
* AI classification
* Resource management
* Resource assignment
* Alerts and escalation
* Responder updates
* Incident timelines
* Analytics
* Demo/simulation data

Use **MongoDB Atlas** with **Mongoose**.

The application must use a modular MongoDB design with separate collections rather than storing the entire emergency workflow inside one large incident document.

---

# 2. Database

Database name:

```text
ps9_emergency_platform
```

MongoDB connection:

```text
MONGODB_URI=<MongoDB Atlas connection string>
```

The connection string must always come from an environment variable.

Never hardcode:

* MongoDB username
* MongoDB password
* API keys
* JWT secrets

---

# 3. Collections

Create these collections:

```text
users
incidents
sourceReports
resources
alerts
analyticsEvents
```

Optional future collections must not be required for the MVP.

---

# 4. Common Schema Rules

All Mongoose schemas should use:

```js
{
  timestamps: true
}
```

This automatically provides:

```text
createdAt
updatedAt
```

Use MongoDB `ObjectId` for internal references.

Also generate human-readable public IDs.

Example:

```text
USR-10001
INC-10001
REP-10001
RES-10001
ALT-10001
EVT-10001
```

Public IDs are used by the frontend and operators.

MongoDB `_id` remains the internal database identifier.

---

# 5. Users Collection

Collection:

```text
users
```

Purpose:

Stores citizens, responders, operators, administrators and hospital users.

## User schema

Fields:

```text
_id
publicId
name
email
phone
passwordHash
role
isActive
avatar
lastLoginAt
createdAt
updatedAt
```

## Field definitions

### publicId

Type:

```js
String
```

Required:

```text
true
```

Unique:

```text
true
```

Example:

```text
USR-10001
```

### name

Type:

```js
String
```

Required:

```text
true
```

Trim whitespace.

### email

Type:

```js
String
```

Required:

```text
true
```

Unique:

```text
true
```

Store normalized lowercase email.

### phone

Type:

```js
String
```

Optional.

### passwordHash

Type:

```js
String
```

Required for normal login users.

Never store plaintext passwords.

Use `bcryptjs`.

### role

Allowed values:

```text
citizen
responder
operator
admin
hospital
```

Default:

```text
citizen
```

### isActive

Type:

```js
Boolean
```

Default:

```text
true
```

### avatar

Optional string containing an image URL.

### lastLoginAt

Optional date.

---

# 6. Users Indexes

Create:

```text
email: unique
publicId: unique
role
isActive
```

Common queries:

```text
Find user by email
Find user by publicId
Find active responders
Find operators
Find users by role
```

---

# 7. Incidents Collection

Collection:

```text
incidents
```

This is the primary collection of the platform.

An incident represents a unified emergency rather than an individual citizen report.

Multiple source reports may belong to one incident.

---

# 8. Incident Schema

Fields:

```text
_id
publicId
type
severity
priority
status
title
description
location
sourceReports
aiClassification
duplicateCandidates
assignedResources
assignedResponder
timeline
escalation
resolution
isDemo
createdBy
createdAt
updatedAt
```

---

# 9. Incident Public ID

Field:

```text
publicId
```

Type:

```js
String
```

Required:

```text
true
```

Unique:

```text
true
```

Example:

```text
INC-10023
```

---

# 10. Incident Type

Allowed values:

```text
fire
flood
medical
accident
industrial
structural
other
```

Default:

```text
other
```

---

# 11. Incident Severity

Allowed values:

```text
low
medium
high
critical
```

Default:

```text
medium
```

Severity must be changeable by an operator.

---

# 12. Incident Priority

Allowed values:

```text
P1
P2
P3
P4
```

Suggested relationship:

```text
P1 → Critical
P2 → High
P3 → Medium
P4 → Low
```

The operator can override AI-generated priority.

---

# 13. Incident Status

Allowed values:

```text
REPORTED
CLASSIFIED
ASSIGNED
EN_ROUTE
ON_SCENE
RESOLVED
CLOSED
DUPLICATE_CANDIDATE
MERGED
```

Initial status:

```text
REPORTED
```

Allowed normal flow:

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

Duplicate flow:

```text
REPORTED
    ↓
DUPLICATE_CANDIDATE
    ↓
MERGED
```

Do not automatically merge incidents.

Operator confirmation is required.

---

# 14. Incident Title

Example:

```text
Fire reported near Ahmedabad market
```

Type:

```js
String
```

Required:

```text
true
```

---

# 15. Incident Description

Contains the unified emergency description.

Example:

```text
Multiple citizens reported smoke and flames near the market area.
```

Type:

```js
String
```

Required:

```text
true
```

---

# 16. Incident Location

Use GeoJSON.

Structure:

```js
{
  type: "Point",
  coordinates: [longitude, latitude]
}
```

Example:

```json
{
  "type": "Point",
  "coordinates": [72.5714, 23.0225]
}
```

Important:

GeoJSON coordinates must always be:

```text
[longitude, latitude]
```

NOT:

```text
[latitude, longitude]
```

---

# 17. Incident Location Metadata

Also store:

```text
address
landmark
```

Example:

```json
{
  "address": "Synthetic Market Road, Ahmedabad",
  "landmark": "Near central market"
}
```

Demo locations must be clearly synthetic.

Do not present synthetic coordinates as real emergency locations.

---

# 18. Geospatial Index

Create:

```text
location: 2dsphere
```

This is required for duplicate detection and nearby resource queries.

Example:

```js
incidentSchema.index({
  location: "2dsphere"
});
```

---

# 19. Source Reports Reference

Field:

```text
sourceReports
```

Type:

```text
Array<ObjectId>
```

Reference:

```text
SourceReport
```

Example:

```json
[
  "ObjectId(...)",
  "ObjectId(...)"
]
```

One incident can contain multiple citizen reports.

---

# 20. AI Classification

Store AI output inside the incident.

Structure:

```json
{
  "type": "fire",
  "severity": "critical",
  "priority": "P1",
  "confidence": 0.94,
  "summary": "Multiple reports indicate a spreading fire with possible trapped people.",
  "recommendedActions": [
    "Dispatch fire response team",
    "Check for trapped civilians",
    "Request medical support"
  ],
  "provider": "gemini",
  "isFallback": false,
  "classifiedAt": "date"
}
```

Fields:

```text
type
severity
priority
confidence
summary
recommendedActions
provider
isFallback
classifiedAt
```

---

# 21. AI Provider

Allowed values:

```text
gemini
rules
manual
```

Meaning:

```text
gemini → Gemini API generated the classification
rules → deterministic fallback generated it
manual → operator manually classified it
```

The system must work even when Gemini is unavailable.

---

# 22. AI Confidence

Type:

```js
Number
```

Range:

```text
0 to 1
```

Example:

```text
0.92
```

Never allow:

```text
-1
1.5
2
```

If the fallback classifier is used, use a conservative confidence value.

---

# 23. AI Safety Rules

AI output must never:

* Invent resource IDs
* Claim emergency services were contacted
* Claim an ambulance/fire truck has been dispatched unless the database says it was dispatched
* Automatically perform dispatch
* Automatically resolve an incident
* Automatically merge duplicate incidents
* Override an operator decision

AI recommendations are advisory.

Operators remain responsible for dispatch and incident state changes.

---

# 24. Duplicate Candidates

Store potential duplicate incidents.

Structure:

```json
[
  {
    "incidentId": "ObjectId(...)",
    "score": 0.86,
    "locationScore": 0.95,
    "timeScore": 0.9,
    "textScore": 0.8,
    "status": "pending",
    "detectedAt": "date"
  }
]
```

Allowed status:

```text
pending
confirmed
rejected
```

Duplicate score formula:

```text
locationScore × 0.40
+
timeScore × 0.20
+
textScore × 0.40
```

Default candidate threshold:

```text
0.75
```

Default urban location radius:

```text
300 meters
```

Default time window:

```text
10 minutes
```

---

# 25. Assigned Resources

Field:

```text
assignedResources
```

Store resource references.

Example:

```json
[
  {
    "resourceId": "ObjectId(...)",
    "assignedAt": "date",
    "assignedBy": "ObjectId(...)",
    "status": "assigned"
  }
]
```

Allowed assignment status:

```text
assigned
accepted
en_route
on_scene
completed
cancelled
```

---

# 26. Assigned Responder

Optional field:

```text
assignedResponder
```

Reference:

```text
User
```

Only users with:

```text
role = responder
```

should be assigned as responders.

---

# 27. Incident Timeline

Every important incident action must be stored.

Example:

```json
[
  {
    "event": "incident_created",
    "message": "Emergency report received",
    "performedBy": "ObjectId(...)",
    "timestamp": "date"
  },
  {
    "event": "classified",
    "message": "Incident classified as critical fire",
    "performedBy": "ObjectId(...)",
    "timestamp": "date"
  },
  {
    "event": "resource_assigned",
    "message": "Fire response team assigned",
    "performedBy": "ObjectId(...)",
    "timestamp": "date"
  }
]
```

Allowed event examples:

```text
incident_created
classified
duplicate_detected
duplicate_confirmed
resource_recommended
resource_assigned
resource_accepted
status_changed
escalated
note_added
resolved
closed
merged
```

Timeline is important for the demo because the operator must be able to show the entire response history.

---

# 28. Escalation Object

Structure:

```json
{
  "isEscalated": false,
  "level": null,
  "reason": null,
  "escalatedAt": null,
  "escalatedBy": null
}
```

Allowed escalation levels:

```text
warning
critical
```

Suggested thresholds:

```text
P1:
warning = 2 minutes
critical = 5 minutes

P2:
warning = 5 minutes
critical = 10 minutes
```

These values must be configurable.

For hackathon demonstration, configurable short thresholds may be used.

---

# 29. Resolution Object

Structure:

```json
{
  "resolvedAt": null,
  "resolvedBy": null,
  "resolutionNote": null
}
```

When an incident becomes:

```text
RESOLVED
```

store:

```text
resolvedAt
resolvedBy
resolutionNote
```

---

# 30. Demo Flag

Field:

```text
isDemo
```

Type:

```js
Boolean
```

Default:

```text
false
```

Demo/simulation incidents should have:

```text
isDemo = true
```

This prevents synthetic demo data from being confused with normal records.

---

# 31. Created By

Field:

```text
createdBy
```

Reference:

```text
User
```

For citizen reports, this identifies the reporting citizen.

---

# 32. SourceReports Collection

Collection:

```text
sourceReports
```

Purpose:

Stores every original citizen report before/after it is associated with a unified incident.

This preserves the original evidence and allows multiple reports to point to one incident.

---

# 33. Source Report Schema

Fields:

```text
_id
publicId
incidentId
reportedBy
description
typeHint
location
imageUrl
metadata
createdAt
updatedAt
```

### publicId

Example:

```text
REP-10001
```

Unique.

### incidentId

Reference:

```text
Incident
```

Optional during initial processing.

### reportedBy

Reference:

```text
User
```

Required.

### description

Original user-submitted emergency description.

Required.

### typeHint

Optional citizen-selected category.

Allowed:

```text
fire
flood
medical
accident
industrial
structural
other
```

### location

GeoJSON Point.

Create:

```text
2dsphere
```

index.

### imageUrl

Optional.

Only store the URL.

Do not store large image binaries in MongoDB.

### metadata

Optional object.

Example:

```json
{
  "source": "web",
  "device": "desktop"
}
```

---

# 34. Resources Collection

Collection:

```text
resources
```

Purpose:

Stores emergency resources available for dispatch.

Examples:

* Fire teams
* Ambulances
* Police units
* Rescue teams
* Hospitals

---

# 35. Resource Schema

Fields:

```text
_id
publicId
name
type
capabilities
status
location
baseLocation
contact
currentIncident
availability
capacity
metadata
createdAt
updatedAt
```

---

# 36. Resource Public ID

Examples:

```text
FT-04
AMB-02
PU-03
RST-01
HOS-01
```

Also support the generic format:

```text
RES-10001
```

`publicId` must be unique.

---

# 37. Resource Type

Allowed values:

```text
fire_team
ambulance
police
rescue
hospital
```

---

# 38. Resource Capabilities

Store an array.

Examples:

Fire team:

```json
[
  "fire_suppression",
  "rescue",
  "hazmat"
]
```

Ambulance:

```json
[
  "medical",
  "trauma",
  "transport"
]
```

Police:

```json
[
  "traffic_control",
  "crowd_control",
  "security"
]
```

Rescue:

```json
[
  "search_rescue",
  "structural_rescue"
]
```

Hospital:

```json
[
  "emergency",
  "trauma",
  "critical_care"
]
```

---

# 39. Resource Status

Allowed values:

```text
available
assigned
en_route
on_scene
unavailable
maintenance
```

Default:

```text
available
```

---

# 40. Resource Location

Use GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [72.5714, 23.0225]
}
```

Create:

```text
2dsphere
```

index.

This allows nearby-resource queries.

---

# 41. Current Incident

Optional reference:

```text
currentIncident
```

Reference:

```text
Incident
```

When resource becomes available again:

```text
currentIncident = null
```

---

# 42. Resource Availability

Structure:

```json
{
  "isAvailable": true,
  "lastUpdated": "date"
}
```

The system must keep `status` and availability logically consistent.

Example:

```text
status = available
isAvailable = true
```

```text
status = assigned
isAvailable = false
```

---

# 43. Resource Contact

Optional:

```json
{
  "phone": "demo-contact",
  "radioChannel": "CH-04"
}
```

Use synthetic contact information for demo data.

---

# 44. Resource Capacity

Optional object.

Example:

```json
{
  "personnel": 6,
  "patients": 0
}
```

For hospitals:

```json
{
  "personnel": 25,
  "patients": 10
}
```

---

# 45. Resource Recommendations

Recommendations do not need their own collection for the MVP.

Calculate dynamically.

Recommendation score:

```text
Capability Match × 0.50
+
Availability × 0.25
+
Distance × 0.25
```

Return the top 3 suitable resources.

The recommendation response should include:

```text
resource
matchScore
distance
estimatedEta
reason
```

Do not permanently store recommendations unless needed for analytics.

---

# 46. Alerts Collection

Collection:

```text
alerts
```

Purpose:

Stores operator/responder alerts and escalation notifications.

---

# 47. Alert Schema

Fields:

```text
_id
publicId
type
severity
title
message
incidentId
resourceId
recipientRole
recipientUser
isRead
isAcknowledged
acknowledgedBy
acknowledgedAt
expiresAt
createdAt
updatedAt
```

---

# 48. Alert Type

Allowed values:

```text
new_incident
critical_incident
duplicate_candidate
resource_assigned
resource_delayed
escalation_warning
escalation_critical
incident_resolved
system
```

---

# 49. Alert Severity

Allowed values:

```text
info
warning
critical
```

---

# 50. Alert References

Optional:

```text
incidentId
resourceId
recipientUser
```

Use ObjectId references.

An alert should normally reference an incident when related to an emergency.

---

# 51. Alert Acknowledgement

When acknowledged:

```text
isAcknowledged = true
acknowledgedBy = userId
acknowledgedAt = current time
```

Do not delete alerts immediately after acknowledgement.

They are useful for the alert feed and audit history.

---

# 52. Analytics Events Collection

Collection:

```text
analyticsEvents
```

Purpose:

Stores important system events for analytics and demo reporting.

Examples:

```text
incident_created
incident_classified
resource_assigned
incident_escalated
incident_resolved
duplicate_detected
duplicate_merged
```

---

# 53. Analytics Event Schema

Fields:

```text
_id
publicId
eventType
incidentId
resourceId
userId
metadata
timestamp
createdAt
updatedAt
```

`timestamp` represents when the actual event occurred.

---

# 54. Analytics Event Metadata

Flexible object.

Example:

```json
{
  "severity": "critical",
  "priority": "P1",
  "responseTimeSeconds": 142
}
```

Keep metadata small and structured.

Do not store unnecessary large objects.

---

# 55. Analytics Queries

The backend should calculate:

### Active incidents

Statuses not equal to:

```text
RESOLVED
CLOSED
MERGED
```

### Critical incidents

```text
severity = critical
```

### Resources deployed

Resources with:

```text
assigned
en_route
on_scene
```

### Average response time

Calculate:

```text
ON_SCENE timestamp - incident createdAt
```

### Average resolution time

Calculate:

```text
RESOLVED timestamp - incident createdAt
```

### Incidents by type

Group:

```text
fire
flood
medical
accident
industrial
structural
other
```

### Incidents by severity

Group:

```text
low
medium
high
critical
```

### Incidents by priority

Group:

```text
P1
P2
P3
P4
```

---

# 56. Recommended MongoDB Indexes

## Users

```text
email: unique
publicId: unique
role
isActive
```

## Incidents

```text
publicId: unique
location: 2dsphere
status
severity
priority
type
createdAt
```

Useful compound index:

```text
status + createdAt
```

## Source Reports

```text
publicId: unique
location: 2dsphere
incidentId
createdAt
reportedBy
```

## Resources

```text
publicId: unique
location: 2dsphere
type
status
```

Useful compound index:

```text
type + status
```

## Alerts

```text
publicId: unique
incidentId
isAcknowledged
createdAt
recipientUser
```

## Analytics Events

```text
eventType
incidentId
timestamp
```

---

# 57. Geospatial Queries

The backend must use MongoDB geospatial queries for:

1. Finding nearby duplicate reports
2. Finding nearby incidents
3. Finding nearby emergency resources
4. Displaying map data

Example concept:

```js
{
  location: {
    $near: {
      $geometry: {
        type: "Point",
        coordinates: [longitude, latitude]
      },
      $maxDistance: 300
    }
  }
}
```

Distances are in meters.

---

# 58. Duplicate Detection Database Query

Duplicate detection should approximately follow:

```text
1. Receive new source report.
2. Search nearby incidents within 300 meters.
3. Limit search to incidents created within the configured time window.
4. Compare report text with candidate incident descriptions.
5. Calculate:
   location score
   time score
   text similarity score
6. Calculate final duplicate score.
7. If score >= 0.75:
      create duplicate candidate.
8. Do not automatically merge.
```

---

# 59. Incident Relationships

Relationship structure:

```text
User
 │
 └── creates ──> SourceReport
                     │
                     └── belongs to ──> Incident
                                           │
                  ┌────────────────────────┼──────────────────────┐
                  │                        │                      │
                  ↓                        ↓                      ↓
              Resources                 Alerts               Timeline
```

An incident can have:

```text
many source reports
many assigned resources
many alerts
many timeline events
many analytics events
```

---

# 60. Data Consistency Rules

The backend must enforce the following.

### Rule 1

A resource cannot be assigned if:

```text
status = unavailable
```

or:

```text
status = maintenance
```

### Rule 2

When resource is assigned:

```text
resource.status = assigned
resource.currentIncident = incident._id
```

### Rule 3

When resource becomes:

```text
available
```

clear:

```text
currentIncident
```

### Rule 4

A resolved incident should not accept a new resource assignment.

### Rule 5

A closed incident should be immutable except for authorized administrative operations.

### Rule 6

A duplicate candidate must not automatically merge.

### Rule 7

Only operators/admins can:

```text
assign resources
merge incidents
change priority
escalate
resolve incidents
```

### Rule 8

Only responders assigned to an incident can update their operational status.

### Rule 9

Every major state change must create a timeline event.

### Rule 10

Every major operational event should create an analytics event.

---

# 61. Soft Deletion

Emergency records should generally not be physically deleted.

For important collections, prefer:

```text
isDeleted
deletedAt
deletedBy
```

where deletion is required.

For the MVP:

* Do not delete incidents.
* Do not delete source reports.
* Do not delete alerts.
* Do not delete analytics events.

Users/resources can be deactivated instead.

Example:

```text
user.isActive = false
```

```text
resource.status = unavailable
```

---

# 62. Seed Data

Create a seed script:

```text
server/src/seed/seedData.js
```

Seed:

### Users

```text
1 admin
1 operator
2 responders
1 citizen
1 hospital user
```

Use safe demo credentials.

Do not use real people's credentials.

---

# 63. Seed Resources

Create approximately:

```text
5 fire teams
5 ambulances
3 police units
3 rescue teams
3 hospitals
```

Each resource must contain:

```text
publicId
name
type
capabilities
status
location
```

Example:

```json
{
  "publicId": "FT-04",
  "name": "Fire Response Team 04",
  "type": "fire_team",
  "capabilities": [
    "fire_suppression",
    "rescue"
  ],
  "status": "available"
}
```

---

# 64. Seed Incidents

Create:

```text
3 active incidents
2 resolved incidents
1 duplicate candidate
```

Use different categories:

```text
fire
medical
accident
flood
industrial
```

Include different severity and priority values.

---

# 65. Seed Alerts

Create at least:

```text
1 warning alert
1 critical alert
```

Example:

```text
CRITICAL — Fire incident has not received responder confirmation.
```

All demo alert text must clearly represent synthetic/demo data.

---

# 66. Synthetic Ahmedabad Data

Seed data may use Ahmedabad-style locations for the hackathon demonstration.

However, all seed locations must be clearly synthetic.

Example:

```text
Synthetic Market Road
Synthetic Industrial Area
Demo Hospital Zone
Demo Riverfront Area
```

Do not imply that a real emergency is happening at these locations.

---

# 67. Demo Incident Structure

A demo fire incident should contain:

```text
publicId
type = fire
severity = critical
priority = P1
status
location
AI classification
source reports
assigned resources
timeline
escalation
```

This allows the entire hackathon workflow to be demonstrated from a single database record.

---

# 68. Example Incident Document

Example:

```json
{
  "publicId": "INC-10001",
  "type": "fire",
  "severity": "critical",
  "priority": "P1",
  "status": "ASSIGNED",
  "title": "Fire reported near synthetic market",
  "description": "Multiple reports describe smoke and spreading flames.",
  "location": {
    "type": "Point",
    "coordinates": [72.5714, 23.0225]
  },
  "sourceReports": [],
  "aiClassification": {
    "type": "fire",
    "severity": "critical",
    "priority": "P1",
    "confidence": 0.94,
    "summary": "Multiple reports indicate a spreading fire.",
    "recommendedActions": [
      "Dispatch fire response team",
      "Check for trapped civilians",
      "Request medical support"
    ],
    "provider": "gemini",
    "isFallback": false
  },
  "assignedResources": [],
  "timeline": [
    {
      "event": "incident_created",
      "message": "Emergency report received",
      "timestamp": "2026-09-19T10:00:00.000Z"
    },
    {
      "event": "classified",
      "message": "Incident classified as critical fire",
      "timestamp": "2026-09-19T10:00:10.000Z"
    }
  ],
  "escalation": {
    "isEscalated": false,
    "level": null
  },
  "resolution": {
    "resolvedAt": null,
    "resolvedBy": null,
    "resolutionNote": null
  },
  "isDemo": true
}
```

---

# 69. Mongoose Model Organization

Create these model files:

```text
server/src/models/
├── User.js
├── Incident.js
├── SourceReport.js
├── Resource.js
├── Alert.js
└── AnalyticsEvent.js
```

Each model should:

* Define a Mongoose schema.
* Define required fields.
* Define enum restrictions.
* Define defaults.
* Define indexes.
* Use timestamps.
* Export the model.

Avoid putting business logic inside the models unless it is simple schema-level behavior.

Business logic belongs in services.

---

# 70. Database Configuration

Create:

```text
server/src/config/db.js
```

Responsibilities:

```text
connect to MongoDB
handle connection errors
log successful connection
handle graceful shutdown
```

The application must fail clearly if MongoDB is required but unavailable.

Optional external services such as Gemini or Cloudinary must not prevent the database from connecting.

---

# 71. Environment Variables

Use:

```text
MONGODB_URI=
```

Other environment variables remain separate:

```text
PORT=
JWT_SECRET=
GEMINI_API_KEY=
CLIENT_URL=
```

Never commit `.env`.

Create:

```text
.env.example
```

containing variable names but no secrets.

---

# 72. Database Validation

Use Mongoose validation for:

```text
required fields
enums
strings
numbers
confidence range
GeoJSON structure
references
```

Additional validation should be performed in service/controller layers.

Do not rely only on frontend validation.

---

# 73. Database Error Handling

Handle:

```text
duplicate key errors
validation errors
invalid ObjectId
MongoDB connection failures
missing referenced resources
```

Return the standard API error structure:

```json
{
  "success": false,
  "message": "Resource not found",
  "code": "RESOURCE_NOT_FOUND"
}
```

Never expose:

```text
MongoDB connection strings
database credentials
stack traces
internal secrets
```

to the frontend.

---

# 74. Database Implementation Order

Implement the database in this order:

```text
1. MongoDB connection
2. User model
3. Resource model
4. Incident model
5. SourceReport model
6. Alert model
7. AnalyticsEvent model
8. Indexes
9. Seed script
10. Database validation
11. Test CRUD operations
```

After models are complete:

```text
Auth service
    ↓
Incident service
    ↓
AI/classification service
    ↓
Duplicate service
    ↓
Resource recommendation service
    ↓
Alert service
    ↓
Analytics service
```

---

# 75. MVP Database Priorities

### P1 — Must work

```text
MongoDB Atlas connection
Users
Incidents
Resources
Source reports
GeoJSON locations
Indexes
Seed data
```

### P2 — Important

```text
Alerts
Incident timeline
Duplicate candidates
AI classification fields
Resource assignments
Escalation
```

### P3 — Useful

```text
Analytics events
Detailed resource capacity
Advanced audit information
Demo simulation metadata
```

Do not delay the core application for advanced database features.

---

# 76. Database Acceptance Criteria

The database implementation is complete when:

* [ ] MongoDB Atlas connection works.
* [ ] All six required models exist.
* [ ] Mongoose validation is implemented.
* [ ] Public IDs are generated correctly.
* [ ] Users have valid roles.
* [ ] Incidents support all required states.
* [ ] Incidents support all required emergency types.
* [ ] Severity and priority enums work.
* [ ] GeoJSON locations are stored correctly.
* [ ] `2dsphere` indexes exist.
* [ ] Source reports can belong to incidents.
* [ ] AI classification can be stored.
* [ ] Duplicate candidates can be stored.
* [ ] Resources support capabilities and statuses.
* [ ] Resources can reference incidents.
* [ ] Alerts can reference incidents/resources/users.
* [ ] Incident timeline can record state changes.
* [ ] Escalation information can be stored.
* [ ] Resolution information can be stored.
* [ ] Analytics events can be recorded.
* [ ] Seed script creates demo data.
* [ ] Seed data is synthetic.
* [ ] Important emergency records are not physically deleted.
* [ ] Database credentials are stored only in environment variables.
* [ ] Backend can query nearby incidents/resources using geospatial indexes.
* [ ] Database errors are handled through the standard API error format.

---

# 77. Kiro Implementation Instruction

Implement this database design as the source of truth for the PS-9 backend.

Do not introduce:

```text
PostgreSQL
PostGIS
Redis
Kafka
RabbitMQ
vector databases
microservices
```

The MVP must use:

```text
MongoDB Atlas
+
Mongoose
```

Keep the database implementation simple enough to finish during the hackathon.

The most important goal is to support the complete emergency workflow:

```text
Citizen Report
      ↓
Source Report
      ↓
AI Classification
      ↓
Incident
      ↓
Duplicate Detection
      ↓
Resource Recommendation
      ↓
Operator Dispatch
      ↓
Responder Status
      ↓
Escalation
      ↓
Resolution
      ↓
Analytics
```

Build the database for this workflow first.

Do not over-engineer the schema.
