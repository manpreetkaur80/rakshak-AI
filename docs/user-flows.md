# PS-9 — User Flows

## 1. Purpose

This document defines how each user interacts with the PS-9 Intelligent Emergency Response & Resource Coordination Platform.

The implementation must prioritize these complete workflows:

```text
Citizen
  ↓
Report Emergency
  ↓
AI Classification
  ↓
Duplicate Detection
  ↓
Operator Review
  ↓
Resource Recommendation
  ↓
Dispatch
  ↓
Responder
  ↓
Live Status Updates
  ↓
Resolution
  ↓
Analytics
```

The system is a hackathon decision-support prototype using synthetic/demo data.

AI recommendations are advisory and must not automatically perform emergency operations.

---

# 2. User Roles

The application supports five roles:

```text
citizen
responder
operator
admin
hospital
```

## Role Summary

| Role      | Main Purpose                                   |
| --------- | ---------------------------------------------- |
| Citizen   | Report and track emergencies                   |
| Responder | Receive assignments and update response status |
| Operator  | Monitor incidents and coordinate resources     |
| Admin     | Manage demo data and system configuration      |
| Hospital  | Represent medical response resources           |

---

# 3. Authentication Flow

## 3.1 Login

```text
User opens application
        ↓
Login page
        ↓
Enter email + password
        ↓
POST /api/v1/auth/login
        ↓
Backend validates credentials
        ↓
JWT generated
        ↓
Frontend stores authentication state
        ↓
Redirect based on role
```

### Redirect Rules

```text
citizen
→ Citizen Report / Track Incident

responder
→ Responder Dashboard

operator
→ Command Dashboard

admin
→ Admin Dashboard

hospital
→ Hospital/Resource View
```

---

# 4. Citizen Flow

## 4.1 Report Emergency

The citizen should be able to report an emergency with minimal friction.

### Flow

```text
Citizen opens Report Emergency
        ↓
Select incident type OR describe emergency
        ↓
Enter description
        ↓
Get current location
        ↓
Confirm location
        ↓
Optional image upload
        ↓
Submit report
        ↓
Backend validates request
        ↓
Create source report
        ↓
AI classification
        ↓
Duplicate detection
        ↓
Create or associate incident
        ↓
Return public tracking ID
        ↓
Show confirmation
```

---

## 4.2 Report Form

Required fields:

```text
Incident description
Location
```

Optional fields:

```text
Incident type
Image
Contact information
```

The UI should allow a citizen to submit quickly.

Do not make the form unnecessarily long.

---

## 4.3 Location Flow

Preferred:

```text
Click "Use My Location"
        ↓
Browser geolocation permission
        ↓
Latitude + longitude
        ↓
Display location on map
        ↓
Citizen confirms
```

Fallback:

```text
Geolocation unavailable/denied
        ↓
Manual location selection
        ↓
Citizen confirms
```

The application must still work if browser geolocation is unavailable.

---

# 5. Citizen Submission Backend Flow

When the citizen presses Submit:

```text
POST /api/v1/incidents
        ↓
Validate request
        ↓
Validate location
        ↓
Create source report
        ↓
Run classification service
        ↓
Run duplicate detection
        ↓
Create new incident OR associate with existing incident
        ↓
Store AI result
        ↓
Emit Socket.IO event
        ↓
Return public incident ID
```

Expected response concept:

```json
{
  "success": true,
  "data": {
    "publicId": "INC-10024",
    "status": "reported",
    "message": "Emergency report received"
  }
}
```

---

# 6. Citizen Confirmation Screen

After submission, display:

```text
Report Received

Incident ID:
INC-10024

Type:
Fire

Priority:
P1

Status:
Reported

Your report has been received and is being reviewed.
```

If AI classification is still processing:

```text
AI assessment in progress...
```

Do not claim that emergency services have been contacted.

---

# 7. Track Incident Flow

Citizen can enter:

```text
Incident ID
```

or open their submitted incident.

Flow:

```text
Track Incident
      ↓
Enter public incident ID
      ↓
GET /api/v1/incidents/:id
      ↓
Display status
      ↓
Display timeline
      ↓
Display basic location
```

Citizen should see statuses such as:

```text
Reported
Classified
Assigned
En Route
On Scene
Resolved
```

Do not expose sensitive operator-only information.

---

# 8. Citizen Incident Timeline

Example:

```text
10:30 AM
✓ Report received

10:30 AM
✓ Incident classified

10:31 AM
✓ Response resource assigned

10:33 AM
✓ Responder en route

10:37 AM
✓ Responder on scene

10:45 AM
✓ Incident resolved
```

The timeline should be generated from actual incident events stored by the backend.

---

# 9. Operator Flow

The operator is the central coordinator.

## 9.1 Command Dashboard

After login:

```text
Operator Login
      ↓
Command Dashboard
```

Dashboard displays:

```text
Active Incidents
Critical Incidents
Resources Deployed
Average Response Time
Pending Alerts
Resolved Today
```

Main sections:

```text
Incident List
Live Map
Resource Panel
Alert Feed
KPI Cards
```

---

# 10. New Incident Flow

When a citizen submits a report:

```text
Citizen submits report
        ↓
Backend creates incident
        ↓
Socket.IO incident:created
        ↓
Operator dashboard receives event
        ↓
New incident appears
        ↓
Operator can open incident details
```

No manual browser refresh should be required.

---

# 11. Operator Incident Review

Operator selects an incident.

Display:

```text
Incident ID
Type
Severity
Priority
Status
Location
Description
AI Confidence
AI Summary
Recommended Actions
Related Reports
Recommended Resources
Incident Timeline
```

Example:

```text
INC-10024

Type: Fire
Severity: Critical
Priority: P1
Status: Classified

AI Confidence: 94%

Summary:
Large fire reported near a crowded market.

Related Reports:
3

Recommended Resources:
Fire Team FT-04
Ambulance AMB-02
Police PU-03
```

---

# 12. AI Classification Flow

When an incident is created:

```text
Incident description
        ↓
Classification Service
        ↓
Check Gemini availability
        ↓
Gemini available?
   ┌───────────────┐
   │ YES           │ NO
   ↓               ↓
Gemini          Rule-Based
Classification  Classification
   │               │
   └───────┬───────┘
           ↓
Validate result
           ↓
Store classification
           ↓
Notify operator
```

AI should produce:

```text
Type
Severity
Priority
Confidence
Summary
Recommended Actions
```

---

# 13. Operator AI Review

The AI result is a recommendation.

Operator must be able to review and modify:

```text
Type
Severity
Priority
```

Example:

```text
AI:
Severity = Critical

Operator:
Change Severity → High
```

The final operator decision should be stored.

The system should retain enough information to distinguish AI suggestion from operator override.

---

# 14. Duplicate Detection Flow

When a new report arrives:

```text
New source report
        ↓
Find nearby recent incidents
        ↓
Location similarity
        +
Time similarity
        +
Text similarity
        ↓
Calculate duplicate score
        ↓
Score >= 0.75?
       / \
     YES  NO
      ↓    ↓
Candidate  New/normal
      ↓
Show to operator
```

Default values:

```text
Radius: 300 meters
Time window: 10 minutes
Location weight: 40%
Time weight: 20%
Text weight: 40%
Candidate threshold: 0.75
```

---

# 15. Operator Duplicate Review

If a duplicate candidate is found:

```text
Possible Duplicate

Existing Incident:
INC-10024

New Report:
REP-10009

Similarity:
82%

[Merge Reports]
[Keep Separate]
```

### If Merge

```text
Operator confirms Merge
        ↓
Source report linked to existing incident
        ↓
Incident report count increases
        ↓
Timeline updated
        ↓
Socket.IO incident update
```

### If Keep Separate

```text
Operator selects Keep Separate
        ↓
New incident remains independent
```

The system must never automatically merge incidents.

---

# 16. Resource Recommendation Flow

After classification:

```text
Incident type/severity
        ↓
Determine required capabilities
        ↓
Find matching resources
        ↓
Filter unavailable resources
        ↓
Calculate capability score
        ↓
Calculate availability score
        ↓
Calculate distance score
        ↓
Calculate final score
        ↓
Return top recommendations
```

Scoring:

```text
Capability match = 50%
Availability = 25%
Distance = 25%
```

---

# 17. Operator Resource Selection

Operator opens:

```text
Recommended Resources
```

Example:

```text
Fire Team FT-04
Match: 94%
Distance: 2.1 km
ETA: 6 min
Status: Available

Ambulance AMB-02
Match: 89%
Distance: 3.2 km
ETA: 8 min
Status: Available

Police PU-03
Match: 84%
Distance: 4.1 km
ETA: 10 min
Status: Available
```

Operator can:

```text
Dispatch
```

or select another available resource manually.

AI must not automatically dispatch.

---

# 18. Dispatch Flow

```text
Operator clicks Dispatch
        ↓
Select resource
        ↓
POST /api/v1/incidents/:id/assign
        ↓
Backend validates resource availability
        ↓
Incident status → ASSIGNED
        ↓
Resource status → ASSIGNED
        ↓
Create incident timeline event
        ↓
Socket.IO update
        ↓
Responder receives assignment
        ↓
Operator dashboard updates
```

If resource is unavailable:

```text
Dispatch request
        ↓
Backend rejects
        ↓
Show clear error
        ↓
Operator selects another resource
```

---

# 19. Responder Flow

Responder logs in.

```text
Responder Login
      ↓
Responder Dashboard
      ↓
View assigned incidents
      ↓
Open incident
      ↓
Accept assignment
      ↓
Start response
```

Responder should see:

```text
Incident ID
Incident type
Severity
Priority
Description
Location
Map
Assigned resource
Notes
```

---

# 20. Responder Status Flow

```text
ASSIGNED
    ↓
EN_ROUTE
    ↓
ON_SCENE
    ↓
RESOLVED
```

Each status change:

```text
Responder changes status
        ↓
PATCH incident/resource
        ↓
Backend validates transition
        ↓
Save status
        ↓
Create timeline event
        ↓
Emit Socket.IO event
        ↓
Operator dashboard updates
```

---

# 21. Responder "En Route"

Responder clicks:

```text
Start Response
```

System changes:

```text
Incident:
ASSIGNED → EN_ROUTE

Resource:
ASSIGNED → EN_ROUTE
```

Operator sees the update immediately.

---

# 22. Responder "On Scene"

Responder clicks:

```text
Arrived On Scene
```

System changes:

```text
Incident:
EN_ROUTE → ON_SCENE

Resource:
EN_ROUTE → ON_SCENE
```

The timestamp should be stored.

This timestamp is used for response-time analytics.

---

# 23. Responder Resolution

Responder enters an optional response note:

```text
Response Notes:
Fire contained. No additional assistance required.
```

Then clicks:

```text
Resolve Incident
```

System:

```text
Validate responder permission
        ↓
Incident → RESOLVED
        ↓
resolvedAt = current time
        ↓
Resource → AVAILABLE
        ↓
Create timeline event
        ↓
Emit Socket.IO updates
        ↓
Update analytics
```

---

# 24. Operator Resolution

An authorized operator can also resolve an incident.

Flow:

```text
Operator opens incident
        ↓
Clicks Resolve
        ↓
Optional resolution note
        ↓
Confirm
        ↓
Incident → RESOLVED
        ↓
Resources released
        ↓
Timeline updated
        ↓
Analytics updated
```

---

# 25. Escalation Flow

Escalation applies when a high-priority incident remains unattended.

Example:

```text
P1 incident created
        ↓
No resource assigned
        ↓
Warning threshold reached
        ↓
Create warning alert
        ↓
Operator notified
        ↓
Still unresolved/unassigned
        ↓
Critical threshold reached
        ↓
Create critical escalation alert
```

Example thresholds:

```text
P1:
Warning = 2 minutes
Critical = 5 minutes

P2:
Warning = 5 minutes
Critical = 10 minutes
```

Thresholds must be configurable.

For hackathon demonstration, they may be shortened.

---

# 26. Alert Flow

When an alert is created:

```text
Backend creates alert
        ↓
Socket.IO alert:created
        ↓
Operator dashboard receives alert
        ↓
Alert appears in alert feed
        ↓
Operator opens alert
        ↓
Operator acknowledges
```

Acknowledgement:

```text
PATCH /api/v1/alerts/:id/acknowledge
```

Alert status:

```text
unacknowledged
acknowledged
```

---

# 27. Map Flow

The live map is used primarily by operators.

Map displays:

```text
Incident markers
Resource markers
```

Clicking an incident marker:

```text
Marker click
    ↓
Incident summary
    ↓
Open incident details
```

Clicking a resource marker:

```text
Marker click
    ↓
Resource details
```

When a resource is dispatched:

```text
Resource location
        ↓
Incident location
        ↓
Optional OSRM route
        ↓
Display route + ETA
```

If routing fails, continue using approximate ETA.

---

# 28. Real-Time Dashboard Flow

Example:

```text
Responder changes:
EN_ROUTE
```

Backend:

```text
Update MongoDB
      ↓
Emit incident:updated
```

Frontend:

```text
Socket.IO receives event
      ↓
Update local state
      ↓
Update incident list
      ↓
Update map
      ↓
Update incident detail
      ↓
Update KPI if required
```

No full-page refresh should be necessary.

---

# 29. Analytics Flow

Analytics should be based on stored incident/resource data.

Flow:

```text
Incidents + Resources + Timeline Events
                ↓
Analytics Service
                ↓
Calculate metrics
                ↓
GET /api/v1/analytics/*
                ↓
React charts
```

Metrics include:

```text
Active incidents
Critical incidents
Resolved today
Average response time
Average resolution time
Resource utilization
Incident types
Severity distribution
Hotspots
```

---

# 30. Admin Flow

Admin login:

```text
Admin Login
    ↓
Admin Dashboard
```

Admin can:

```text
View users
View resources
Seed demo data
View analytics
Start demo scenario
```

The admin interface should remain simple.

Do not build a complex enterprise administration system.

---

# 31. Demo Seed Flow

Admin clicks:

```text
Seed Demo Data
```

System creates synthetic:

```text
Users
Resources
Incidents
Alerts
```

Example:

```text
5 Fire Teams
5 Ambulances
3 Police Units
3 Rescue Teams
3 Hospitals
```

Incidents:

```text
3 active
2 resolved
1 duplicate candidate
```

Alerts:

```text
1 warning
1 critical
```

---

# 32. Market Fire Demo Flow

This is the primary hackathon presentation workflow.

## Step 1 — First Citizen

Citizen submits:

```text
There is a large fire near the market and people are trapped.
```

System:

```text
Create report
↓
Classify Fire
↓
Critical severity
↓
P1 priority
↓
Create incident
```

---

## Step 2 — Second Citizen

Another citizen submits:

```text
Smoke and fire are visible near the same market.
```

System:

```text
Create second report
↓
Compare with recent incident
↓
Calculate similarity
↓
Possible duplicate
```

---

## Step 3 — Operator Review

Operator receives:

```text
Possible Duplicate Incident
```

Operator sees:

```text
Existing incident
New report
Distance
Time difference
Text similarity
Overall score
```

Operator clicks:

```text
Merge Reports
```

---

## Step 4 — AI Summary

Incident displays:

```text
Type: Fire
Severity: Critical
Priority: P1
Confidence: 94%
```

AI summary:

```text
Multiple reports indicate a potentially critical fire
near a crowded market with possible trapped persons.
```

---

## Step 5 — Resource Recommendation

System recommends:

```text
Fire Team
Ambulance
Police Unit
```

Operator reviews recommendations.

---

## Step 6 — Dispatch

Operator clicks:

```text
Dispatch
```

System:

```text
Incident → ASSIGNED
Resource → ASSIGNED
Responder notified
```

---

## Step 7 — Responder

Responder opens assignment.

Changes:

```text
ASSIGNED
    ↓
EN_ROUTE
```

Operator dashboard updates immediately.

---

## Step 8 — Map

Operator sees:

```text
Incident marker
+
Resource marker
+
Route
+
ETA
```

---

## Step 9 — Arrival

Responder clicks:

```text
Arrived On Scene
```

System:

```text
Incident → ON_SCENE
Resource → ON_SCENE
```

Dashboard updates live.

---

## Step 10 — Resolution

Responder adds:

```text
Fire contained. Incident resolved.
```

Then clicks:

```text
Resolve
```

System:

```text
Incident → RESOLVED
Resource → AVAILABLE
```

---

## Step 11 — Analytics

Dashboard updates:

```text
Resolved Today +1
Active Incidents -1
Resource Available +1
Average Response Time updated
```

The complete workflow is now visible.

---

# 33. Complete End-to-End Flow

The application should support this complete sequence:

```text
                    CITIZEN
                       │
                       ▼
              Report Emergency
                       │
                       ▼
                Source Report
                       │
                       ▼
               Create Incident
                       │
              ┌────────┴────────┐
              ▼                 ▼
       AI Classification   Duplicate Detection
              │                 │
              └────────┬────────┘
                       ▼
                OPERATOR REVIEW
                       │
                       ▼
             Severity / Priority
                       │
                       ▼
           Resource Recommendation
                       │
                       ▼
                  DISPATCH
                       │
                       ▼
                  RESPONDER
                       │
                       ▼
                  EN_ROUTE
                       │
                       ▼
                  ON_SCENE
                       │
                       ▼
                  RESOLVED
                       │
                       ▼
                   ANALYTICS
```

---

# 34. Failure and Fallback Flows

## Gemini Failure

```text
Gemini request
     ↓
Failure
     ↓
Rule-based classification
     ↓
Continue workflow
```

User-facing message:

```text
AI service unavailable. Automated fallback classification used.
```

---

## Geolocation Failure

```text
Browser location unavailable
     ↓
Manual location selection
     ↓
Continue report
```

---

## OSRM Failure

```text
Routing request fails
     ↓
Calculate approximate distance
     ↓
Calculate approximate ETA
     ↓
Continue map workflow
```

---

## Image Upload Failure

```text
Image upload fails
     ↓
Show non-blocking warning
     ↓
Continue incident submission
```

---

# 35. Unauthorized Action Flow

If a user attempts an action they do not have permission for:

```text
Request
  ↓
JWT validation
  ↓
Role validation
  ↓
Unauthorized?
  ↓
403 Forbidden
```

Frontend should show:

```text
You do not have permission to perform this action.
```

Do not expose internal backend details.

---

# 36. Invalid Incident Flow

If required data is missing:

```text
Submit report
     ↓
Backend validation
     ↓
Invalid request
     ↓
400 Bad Request
     ↓
Frontend displays field/message error
```

Example:

```text
Description is required.
Location is required.
```

---

# 37. State Transition Rules

Only valid transitions should be accepted.

### Incident

```text
REPORTED → CLASSIFIED
CLASSIFIED → ASSIGNED
ASSIGNED → EN_ROUTE
EN_ROUTE → ON_SCENE
ON_SCENE → RESOLVED
RESOLVED → CLOSED
```

Duplicate:

```text
REPORTED → DUPLICATE_CANDIDATE
DUPLICATE_CANDIDATE → MERGED
```

Invalid transitions must return an error.

Example:

```text
RESOLVED → EN_ROUTE
```

should not be allowed through the normal workflow.

---

# 38. UI Navigation Flow

## Citizen

```text
Login
 ↓
Report Emergency
 ↓
Confirmation
 ↓
Track Incident
```

## Operator

```text
Login
 ↓
Dashboard
 ├── Incidents
 │    └── Incident Details
 ├── Resources
 ├── Alerts
 └── Analytics
```

## Responder

```text
Login
 ↓
Responder Dashboard
 ↓
Assigned Incident
 ↓
Incident Details
 ↓
Status Updates
```

## Admin

```text
Login
 ↓
Admin Dashboard
 ├── Users
 ├── Resources
 ├── Analytics
 └── Demo Mode
```

---

# 39. User Experience Principles

The flows must prioritize:

1. Fast emergency reporting
2. Clear incident status
3. Clear operator actions
4. Minimal unnecessary steps
5. Real-time updates
6. Visible AI confidence
7. Explainable duplicate detection
8. Human approval before dispatch/merge
9. Clear error messages
10. Reliable fallback behavior

The citizen interface should be simple.

The operator interface should be information-dense.

The responder interface should be action-oriented.

---

# 40. Acceptance Criteria

The user-flow implementation is complete when:

### Citizen

* Citizen can submit an emergency.
* Location can be obtained or entered manually.
* Citizen receives an incident ID.
* Citizen can track incident status.

### Operator

* Operator sees new incidents in real time.
* Operator can inspect AI classification.
* Operator can override severity/priority.
* Operator can review duplicate candidates.
* Operator can merge or keep reports separate.
* Operator can view recommended resources.
* Operator can dispatch a resource.
* Operator can escalate an incident.
* Operator can resolve an incident.

### Responder

* Responder sees assigned incidents.
* Responder can change status.
* Status changes appear on operator dashboard.
* Responder can add resolution notes.
* Responder can resolve assigned incidents.

### System

* AI has a rule-based fallback.
* Duplicate detection works using location/time/text.
* Resources are filtered by availability.
* Alerts are generated for delayed incidents.
* Map displays incidents/resources.
* Analytics update after incident resolution.
* Market Fire demo can be completed from start to finish.

---

# 41. Primary Hackathon Demonstration

The application should be capable of demonstrating this sequence in approximately a few minutes:

```text
1. Citizen reports market fire
2. AI classifies it as critical/P1
3. Second citizen reports same fire
4. Duplicate candidate appears
5. Operator merges reports
6. AI summary is displayed
7. Fire/medical/police resources are recommended
8. Operator dispatches resources
9. Responder changes to EN_ROUTE
10. Map updates
11. Responder changes to ON_SCENE
12. Incident is resolved
13. Resource becomes available
14. Analytics update
```

This is the **primary acceptance workflow** for the hackathon MVP.

---

# 42. Final Flow Principle

> **Every important feature must connect to the end-to-end emergency workflow.**

Do not build isolated screens that do not communicate with the backend.

The target is:

```text
Real UI
  +
Real API
  +
Real MongoDB data
  +
Real state transitions
  +
Real Socket.IO updates
  +
AI/rule classification
  +
Resource coordination
```

The application should feel like one connected system rather than a collection of separate demo pages.
