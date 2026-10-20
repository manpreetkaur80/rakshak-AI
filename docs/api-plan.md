# PS-9 — API Plan

## 1. API Overview

The PS-9 backend uses a REST API built with:

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT authentication
* Socket.IO for real-time updates

Base URL:

```text
/api/v1
```

Health endpoint:

```text
/health
```

Example local backend:

```text
http://localhost:5000
```

Therefore:

```text
http://localhost:5000/api/v1
```

---

# 2. API Design Principles

All APIs must:

* Use JSON unless file upload is required.
* Validate incoming data.
* Return consistent response structures.
* Use appropriate HTTP status codes.
* Require authentication for protected operations.
* Use role-based authorization.
* Never expose secrets.
* Never expose raw database errors to clients.
* Return useful error messages.
* Keep business logic inside service files rather than route files.

---

# 3. Response Format

## Successful Response

All successful API responses should follow:

```json
{
  "success": true,
  "data": {}
}
```

For lists:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 50
  }
}
```

Pagination metadata is optional for small demo datasets but should be supported where useful.

---

# 4. Error Response

All errors should follow:

```json
{
  "success": false,
  "message": "Incident not found",
  "code": "INCIDENT_NOT_FOUND"
}
```

Possible error codes:

```text
VALIDATION_ERROR
UNAUTHORIZED
FORBIDDEN
NOT_FOUND
USER_NOT_FOUND
INVALID_CREDENTIALS
INCIDENT_NOT_FOUND
RESOURCE_NOT_FOUND
RESOURCE_UNAVAILABLE
INVALID_STATUS_TRANSITION
DUPLICATE_INCIDENT
AI_SERVICE_ERROR
ROUTING_SERVICE_ERROR
INTERNAL_SERVER_ERROR
```

---

# 5. HTTP Status Codes

Use:

```text
200 → Successful request
201 → Resource created
400 → Invalid request
401 → Authentication required/invalid
403 → Insufficient permissions
404 → Resource not found
409 → Conflict
429 → Rate limit exceeded
500 → Server error
503 → Optional external service unavailable
```

---

# 6. Authentication APIs

## 6.1 Register

```http
POST /api/v1/auth/register
```

### Request

```json
{
  "name": "Demo Citizen",
  "email": "citizen@example.com",
  "password": "password123",
  "role": "citizen"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "USER_ID",
      "name": "Demo Citizen",
      "email": "citizen@example.com",
      "role": "citizen"
    }
  }
}
```

### Rules

* Email must be unique.
* Password must be hashed using bcryptjs.
* Do not return password.
* Public registration should normally allow only `citizen`.
* Admin/operator/responder accounts should be created through seed/demo data.

---

# 7. Login

```http
POST /api/v1/auth/login
```

### Request

```json
{
  "email": "operator@example.com",
  "password": "password123"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "token": "JWT_TOKEN",
    "user": {
      "id": "USER_ID",
      "name": "Demo Operator",
      "email": "operator@example.com",
      "role": "operator"
    }
  }
}
```

The JWT must contain enough information for authenticated role checking.

---

# 8. Get Current User

```http
GET /api/v1/auth/me
```

### Header

```http
Authorization: Bearer <JWT>
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "USER_ID",
    "name": "Demo Operator",
    "email": "operator@example.com",
    "role": "operator"
  }
}
```

---

# 9. Incident APIs

## 9.1 Create Incident

```http
POST /api/v1/incidents
```

Authentication:

```text
Citizen authentication preferred.
Demo/anonymous reporting may be supported.
```

### Request

```json
{
  "type": "fire",
  "description": "Large fire near the central market with heavy smoke.",
  "location": {
    "type": "Point",
    "coordinates": [72.58, 23.03]
  },
  "address": "Central Market, Ahmedabad"
}
```

Optional:

```json
{
  "imageUrl": "https://example.com/demo-fire.jpg"
}
```

### Backend Flow

```text
Validate request
      ↓
Create source report
      ↓
Run AI/rule classification
      ↓
Run duplicate detection
      ↓
Create incident
      ↓
Store classification
      ↓
Emit incident:created
```

### Response

```json
{
  "success": true,
  "data": {
    "incident": {
      "publicId": "INC-10024",
      "type": "fire",
      "severity": "critical",
      "priority": "P1",
      "status": "reported",
      "description": "Large fire near the central market with heavy smoke."
    }
  }
}
```

---

# 10. Get Incidents

```http
GET /api/v1/incidents
```

Authentication:

```text
operator/admin/responder
```

Supported query parameters:

```text
status
type
severity
priority
page
limit
search
```

Example:

```text
GET /api/v1/incidents?status=reported&severity=critical
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "publicId": "INC-10024",
      "type": "fire",
      "severity": "critical",
      "priority": "P1",
      "status": "reported",
      "address": "Central Market"
    }
  ]
}
```

---

# 11. Get Incident by ID

```http
GET /api/v1/incidents/:id
```

The `:id` may be the internal MongoDB ID or public incident ID depending on implementation.

Prefer using the public ID in frontend URLs.

### Response

```json
{
  "success": true,
  "data": {
    "publicId": "INC-10024",
    "type": "fire",
    "severity": "critical",
    "priority": "P1",
    "status": "classified",
    "description": "Large fire near the central market.",
    "location": {
      "type": "Point",
      "coordinates": [72.58, 23.03]
    },
    "ai": {
      "classified": true,
      "confidence": 0.94,
      "summary": "Potentially critical fire near a crowded market.",
      "recommendedActions": [
        "Dispatch fire team",
        "Dispatch ambulance",
        "Notify police"
      ]
    },
    "sourceReports": [],
    "assignedResources": [],
    "timeline": []
  }
}
```

---

# 12. Update Incident

```http
PATCH /api/v1/incidents/:id
```

Authentication:

```text
operator/admin
```

Allowed updates include:

```text
type
severity
priority
description
address
```

Example:

```json
{
  "severity": "high",
  "priority": "P2"
}
```

The API must record operator overrides where applicable.

---

# 13. Classify Incident

```http
POST /api/v1/incidents/:id/classify
```

Authentication:

```text
operator/admin
```

### Request

No body required.

### Flow

```text
Incident
   ↓
Gemini available?
   ↓
Gemini classification
OR
Rule fallback
   ↓
Validate result
   ↓
Save AI result
   ↓
Update incident
   ↓
Emit incident:classified
```

### Response

```json
{
  "success": true,
  "data": {
    "type": "fire",
    "severity": "critical",
    "priority": "P1",
    "confidence": 0.94,
    "summary": "Potentially critical fire reported near a crowded market.",
    "recommendedActions": [
      "Dispatch fire team",
      "Dispatch ambulance"
    ]
  }
}
```

---

# 14. Duplicate Detection

```http
POST /api/v1/incidents/:id/check-duplicates
```

Authentication:

```text
operator/admin
```

### Response

```json
{
  "success": true,
  "data": {
    "candidates": [
      {
        "incidentId": "INC-10020",
        "score": 0.82,
        "locationScore": 0.95,
        "timeScore": 0.90,
        "textScore": 0.72
      }
    ]
  }
}
```

Default rules:

```text
Radius: 300m
Time window: 10 minutes

Location: 40%
Time: 20%
Text: 40%

Candidate threshold: 0.75
```

---

# 15. Merge Incident Reports

```http
POST /api/v1/incidents/:id/merge
```

Authentication:

```text
operator/admin
```

### Request

```json
{
  "sourceIncidentId": "INC-10025"
}
```

The `:id` represents the primary incident.

### Flow

```text
Operator confirms merge
        ↓
Validate both incidents
        ↓
Move/link source reports
        ↓
Mark secondary incident as merged
        ↓
Update primary incident
        ↓
Create timeline event
        ↓
Emit incident:updated
```

The system must not merge automatically.

---

# 16. Assign Resource

```http
POST /api/v1/incidents/:id/assign
```

Authentication:

```text
operator/admin
```

### Request

```json
{
  "resourceIds": [
    "FT-04",
    "AMB-02",
    "PU-03"
  ]
}
```

### Flow

```text
Validate incident
        ↓
Validate resources
        ↓
Check availability
        ↓
Assign resources
        ↓
Incident → ASSIGNED
        ↓
Resources → ASSIGNED
        ↓
Create timeline event
        ↓
Emit incident:assigned
        ↓
Emit resource:updated
```

### Response

```json
{
  "success": true,
  "data": {
    "incidentId": "INC-10024",
    "assignedResources": [
      "FT-04",
      "AMB-02",
      "PU-03"
    ],
    "status": "assigned"
  }
}
```

---

# 17. Escalate Incident

```http
POST /api/v1/incidents/:id/escalate
```

Authentication:

```text
operator/admin
```

### Request

```json
{
  "reason": "P1 incident has remained unassigned beyond threshold."
}
```

### Response

```json
{
  "success": true,
  "data": {
    "incidentId": "INC-10024",
    "escalationLevel": 1,
    "alertCreated": true
  }
}
```

Automatic escalation may also be triggered by the escalation service.

---

# 18. Resolve Incident

```http
POST /api/v1/incidents/:id/resolve
```

Authentication:

```text
operator/admin/responder
```

### Request

```json
{
  "note": "Fire contained and incident resolved."
}
```

### Flow

```text
Validate role
        ↓
Validate status transition
        ↓
Incident → RESOLVED
        ↓
resolvedAt = current time
        ↓
Assigned resources → AVAILABLE
        ↓
Create timeline event
        ↓
Emit incident:resolved
        ↓
Update analytics
```

### Response

```json
{
  "success": true,
  "data": {
    "publicId": "INC-10024",
    "status": "resolved",
    "resolvedAt": "2026-09-19T10:30:00.000Z"
  }
}
```

---

# 19. Resource APIs

## 19.1 Get Resources

```http
GET /api/v1/resources
```

Authentication:

```text
operator/admin/responder
```

Query parameters:

```text
type
status
```

Example:

```text
GET /api/v1/resources?type=fire_team&status=available
```

---

# 20. Get Resource

```http
GET /api/v1/resources/:id
```

### Response

```json
{
  "success": true,
  "data": {
    "publicId": "FT-04",
    "name": "Fire Team 04",
    "type": "fire_team",
    "status": "available",
    "capabilities": [
      "fire_suppression",
      "rescue"
    ],
    "location": {
      "type": "Point",
      "coordinates": [72.59, 23.04]
    }
  }
}
```

---

# 21. Update Resource Status

```http
PATCH /api/v1/resources/:id/status
```

Authentication:

```text
operator/admin/responder
```

### Request

```json
{
  "status": "en_route"
}
```

Valid statuses:

```text
available
assigned
en_route
on_scene
unavailable
```

The backend must validate status transitions.

---

# 22. Resource Recommendations

```http
GET /api/v1/resources/recommendations/:incidentId
```

Authentication:

```text
operator/admin
```

### Flow

```text
Incident
   ↓
Determine required capabilities
   ↓
Find available resources
   ↓
Capability score
   +
Availability score
   +
Distance score
   ↓
Final score
   ↓
Top 3 recommendations
```

Weights:

```text
Capability = 50%
Availability = 25%
Distance = 25%
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "resourceId": "FT-04",
      "matchScore": 94,
      "distanceKm": 2.1,
      "etaMinutes": 6,
      "status": "available"
    },
    {
      "resourceId": "AMB-02",
      "matchScore": 89,
      "distanceKm": 3.2,
      "etaMinutes": 8,
      "status": "available"
    }
  ]
}
```

Never recommend unavailable resources as normal recommendations.

---

# 23. Seed Resources

```http
POST /api/v1/resources/seed
```

Authentication:

```text
admin
```

This creates synthetic demo resources.

Example:

```text
5 fire teams
5 ambulances
3 police units
3 rescue teams
3 hospitals
```

The endpoint should avoid creating duplicate seed records when possible.

---

# 24. Alert APIs

## 24.1 Get Alerts

```http
GET /api/v1/alerts
```

Authentication:

```text
operator/admin
```

Optional query:

```text
acknowledged
severity
type
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "id": "ALERT-1001",
      "incidentId": "INC-10024",
      "type": "delayed_response",
      "severity": "critical",
      "message": "P1 incident has not received a response.",
      "acknowledged": false
    }
  ]
}
```

---

# 25. Acknowledge Alert

```http
PATCH /api/v1/alerts/:id/acknowledge
```

Authentication:

```text
operator/admin
```

### Response

```json
{
  "success": true,
  "data": {
    "id": "ALERT-1001",
    "acknowledged": true
  }
}
```

Emit:

```text
alert:updated
```

when appropriate.

---

# 26. Analytics APIs

## 26.1 Overview

```http
GET /api/v1/analytics/overview
```

Authentication:

```text
operator/admin
```

### Response

```json
{
  "success": true,
  "data": {
    "activeIncidents": 4,
    "criticalIncidents": 1,
    "resourcesDeployed": 5,
    "averageResponseTimeMinutes": 8.4,
    "pendingAlerts": 2,
    "resolvedToday": 12
  }
}
```

---

# 27. Incidents by Type

```http
GET /api/v1/analytics/types
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "type": "fire",
      "count": 12
    },
    {
      "type": "medical",
      "count": 8
    },
    {
      "type": "accident",
      "count": 6
    }
  ]
}
```

---

# 28. Incidents by Severity

```http
GET /api/v1/analytics/severity
```

### Response

```json
{
  "success": true,
  "data": [
    {
      "severity": "critical",
      "count": 3
    },
    {
      "severity": "high",
      "count": 8
    },
    {
      "severity": "medium",
      "count": 15
    },
    {
      "severity": "low",
      "count": 7
    }
  ]
}
```

---

# 29. Response Time Analytics

```http
GET /api/v1/analytics/response-time
```

Response time:

```text
ON_SCENE timestamp - incident created timestamp
```

### Response

```json
{
  "success": true,
  "data": {
    "averageMinutes": 8.4,
    "daily": [
      {
        "date": "2026-09-19",
        "averageMinutes": 7.8
      }
    ]
  }
}
```

---

# 30. Hotspots

```http
GET /api/v1/analytics/hotspots
```

Returns incident concentration information suitable for displaying on the map.

Example:

```json
{
  "success": true,
  "data": [
    {
      "latitude": 23.03,
      "longitude": 72.58,
      "incidentCount": 8
    }
  ]
}
```

---

# 31. Demo API

## Start Market Fire Simulation

```http
POST /api/v1/demo/market-fire
```

Authentication:

```text
admin/operator
```

### Request

```json
{
  "scenario": "market_fire"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "simulationId": "DEMO-1001",
    "scenario": "market_fire",
    "status": "started"
  }
}
```

The simulation should generate synthetic events.

---

# 32. Demo Simulation Events

The simulation should approximately demonstrate:

```text
T+00 → First citizen report
T+05 → Second report
T+10 → Duplicate candidate
T+15 → Classification
T+20 → Resource recommendation
T+30 → Dispatch
T+40 → EN_ROUTE
T+60 → ON_SCENE
T+90 → RESOLVED
```

Timing may be accelerated or configurable.

The simulation should emit normal Socket.IO events so the frontend experiences the same workflow as a real interaction.

---

# 33. Health API

```http
GET /health
```

This endpoint should not require authentication.

### Response

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-09-19T10:30:00.000Z"
}
```

If MongoDB is disconnected:

```json
{
  "status": "degraded",
  "database": "disconnected",
  "timestamp": "..."
}
```

The server should not crash merely because an optional external service is unavailable.

---

# 34. Socket.IO Events

REST is used for persistent operations.

Socket.IO is used for real-time updates.

## Server → Client

```text
incident:created
incident:updated
incident:classified
incident:assigned
incident:resolved
resource:updated
alert:created
alert:updated
```

---

# 35. Socket Event Payloads

## incident:created

```json
{
  "publicId": "INC-10024",
  "type": "fire",
  "severity": "critical",
  "priority": "P1",
  "status": "reported"
}
```

## incident:updated

```json
{
  "publicId": "INC-10024",
  "status": "en_route",
  "updatedAt": "..."
}
```

## incident:assigned

```json
{
  "incidentId": "INC-10024",
  "resourceIds": [
    "FT-04",
    "AMB-02"
  ]
}
```

## incident:resolved

```json
{
  "incidentId": "INC-10024",
  "status": "resolved"
}
```

## resource:updated

```json
{
  "resourceId": "FT-04",
  "status": "en_route"
}
```

## alert:created

```json
{
  "id": "ALERT-1001",
  "incidentId": "INC-10024",
  "severity": "critical",
  "type": "delayed_response"
}
```

---

# 36. Client → Server Socket Events

The client may emit:

```text
incident:submit
resource:status
incident:status
alert:acknowledge
```

Persistent state changes should still use REST APIs where appropriate.

Socket.IO should primarily provide real-time communication and updates.

---

# 37. Authentication Middleware

Protected routes must use:

```text
requireAuth
```

Example:

```text
Authorization: Bearer <JWT>
```

Role middleware:

```text
requireRole("operator")
requireRole("admin")
requireRole("responder")
```

Multiple roles may be allowed:

```text
requireRole("operator", "admin")
```

---

# 38. Route Authorization Matrix

| API Area                | Citizen | Responder | Operator | Admin |
| ----------------------- | ------: | --------: | -------: | ----: |
| Register                |     Yes |        No |       No |    No |
| Login                   |     Yes |       Yes |      Yes |   Yes |
| Create incident         |     Yes |  Optional |      Yes |   Yes |
| View own incident       |     Yes |       Yes |      Yes |   Yes |
| View all incidents      |      No |  Assigned |      Yes |   Yes |
| Classify                |      No |        No |      Yes |   Yes |
| Merge                   |      No |        No |      Yes |   Yes |
| Dispatch                |      No |        No |      Yes |   Yes |
| Update responder status |      No |  Assigned |      Yes |   Yes |
| Resolve incident        |      No |  Assigned |      Yes |   Yes |
| View resources          | Limited |  Assigned |      Yes |   Yes |
| Manage resources        |      No |        No | Optional |   Yes |
| View alerts             |      No |   Limited |      Yes |   Yes |
| Acknowledge alerts      |      No |        No |      Yes |   Yes |
| Analytics               |      No |   Limited |      Yes |   Yes |
| Seed demo data          |      No |        No |       No |   Yes |
| Start demo              |      No |        No |      Yes |   Yes |

Backend authorization is the final security boundary.

The frontend must not be relied upon for authorization.

---

# 39. Incident Status Transitions

The backend must enforce:

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

Invalid transitions must be rejected.

Example:

```text
RESOLVED → EN_ROUTE
```

must return:

```json
{
  "success": false,
  "message": "Invalid incident status transition",
  "code": "INVALID_STATUS_TRANSITION"
}
```

---

# 40. API Validation

Validate:

### Incident

```text
description → required
location → required
coordinates → valid longitude/latitude
type → valid enum
severity → valid enum
priority → valid enum
```

### Resource

```text
name → required
type → valid enum
status → valid enum
location → valid GeoJSON
```

### User

```text
name → required
email → valid format
password → minimum length
role → allowed enum
```

Never trust frontend validation alone.

---

# 41. Rate Limiting

Use `express-rate-limit`.

At minimum, protect:

```text
POST /auth/login
POST /auth/register
POST /incidents
POST /demo/*
```

The exact limits may be configured for the hackathon environment.

---

# 42. External Service Handling

## Gemini

If Gemini fails:

```text
Gemini error
↓
Rule fallback
↓
Continue
```

Do not return a fatal server error for a classification failure when fallback is available.

---

## OSRM

If OSRM fails:

```text
OSRM error
↓
Approximate distance/ETA
↓
Continue
```

---

## Cloudinary

If image upload fails:

```text
Upload error
↓
Return useful warning
↓
Allow report without image
```

---

# 43. API Service Structure

Backend services should include:

```text
ai.service.js
classification.service.js
duplicate.service.js
resource.service.js
routing.service.js
alert.service.js
analytics.service.js
```

Controllers should remain relatively thin.

Example:

```text
POST /incidents
      ↓
incident.controller.js
      ↓
classification.service.js
      ↓
duplicate.service.js
      ↓
incident model
```

---

# 44. API Development Order

Implement APIs in this order:

## Phase 1 — Foundation

```text
/health
/auth/register
/auth/login
/auth/me
```

## Phase 2 — Incidents

```text
POST /incidents
GET /incidents
GET /incidents/:id
PATCH /incidents/:id
```

## Phase 3 — Incident Intelligence

```text
POST /incidents/:id/classify
POST /incidents/:id/check-duplicates
POST /incidents/:id/merge
```

## Phase 4 — Resources

```text
GET /resources
GET /resources/:id
PATCH /resources/:id/status
GET /resources/recommendations/:incidentId
POST /resources/seed
```

## Phase 5 — Coordination

```text
POST /incidents/:id/assign
POST /incidents/:id/escalate
POST /incidents/:id/resolve
```

## Phase 6 — Alerts

```text
GET /alerts
PATCH /alerts/:id/acknowledge
```

## Phase 7 — Analytics

```text
GET /analytics/overview
GET /analytics/types
GET /analytics/severity
GET /analytics/response-time
GET /analytics/hotspots
```

## Phase 8 — Demo

```text
POST /demo/market-fire
```

---

# 45. API Acceptance Criteria

The backend API implementation is complete when:

* Health endpoint works.
* Users can register/login.
* JWT authentication works.
* Role authorization works.
* Citizens can create incidents.
* Incidents are stored in MongoDB.
* Operators can list and inspect incidents.
* AI/rule classification works.
* Duplicate candidates can be calculated.
* Operators can merge duplicate reports.
* Resources can be listed.
* Resource recommendations work.
* Operators can dispatch resources.
* Responders can update resource/incident status.
* Escalation alerts can be created.
* Alerts can be acknowledged.
* Incidents can be resolved.
* Analytics endpoints return real database-derived data.
* Socket.IO events update connected clients.
* Market Fire demo can execute the end-to-end workflow.
* Optional external services have fallbacks.
* Errors use the standard response format.

---

# 46. API Implementation Principle

> Keep APIs simple, predictable, validated, and focused on the hackathon workflow.

Do not create unnecessary endpoints.

The API should support the complete workflow:

```text
Report
  ↓
Classify
  ↓
Detect Duplicate
  ↓
Review
  ↓
Recommend Resources
  ↓
Assign
  ↓
Track
  ↓
Escalate
  ↓
Resolve
  ↓
Analyze
```
