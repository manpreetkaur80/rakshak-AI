# PS-9 — AI Design

## 1. Purpose

This document defines the AI functionality for the PS-9 Intelligent Emergency Response & Resource Coordination Platform.

The AI system must help operators process emergency reports faster by:

* Classifying emergency type
* Estimating severity
* Assigning a priority
* Generating a short incident summary
* Suggesting response actions
* Supporting duplicate detection
* Supporting resource recommendations

The AI is an **operator-assistance system**.

It must never independently dispatch emergency resources, merge incidents, resolve incidents, or claim that real emergency services have been contacted.

The system must continue working when the AI API is unavailable.

---

# 2. AI Architecture

Use a two-layer AI architecture:

```text
Citizen Report
      ↓
Input Validation
      ↓
AI Classification Service
      ↓
 ┌─────────────────────┐
 │ Gemini API available│
 └──────────┬──────────┘
            │
       Yes  ↓
     Gemini Classification
            │
            ↓
     Validate JSON Output
            │
            ↓
        Incident
```

Fallback:

```text
Citizen Report
      ↓
Gemini unavailable
      ↓
Rule-Based Classifier
      ↓
Incident
```

The fallback must make the application usable without a Gemini API key.

---

# 3. AI Service

Create:

```text
server/src/services/ai.service.js
```

Responsibilities:

```text
1. Receive emergency report text.
2. Send structured prompt to Gemini.
3. Request JSON-only response.
4. Parse the response.
5. Validate the response.
6. Normalize values.
7. Return safe AI result.
8. Fall back to rule-based classification if needed.
```

The AI service must not directly modify MongoDB.

Database updates belong in the incident/classification service.

---

# 4. Classification Service

Create:

```text
server/src/services/classification.service.js
```

Responsibilities:

```text
Receive report
      ↓
Call AI service
      ↓
Validate classification
      ↓
Store classification
      ↓
Update incident type/severity/priority
      ↓
Create timeline event
      ↓
Create analytics event
      ↓
Emit Socket.IO update
```

---

# 5. AI Input

The AI should receive:

```text
Emergency description
Citizen-selected category if available
Location context if useful
```

Example input:

```text
"There is heavy smoke and fire coming from a shop. Flames are spreading to nearby buildings and people may be trapped inside."
```

Optional category:

```text
fire
```

Do not send unnecessary personal information to the AI.

Do not send:

```text
password
JWT
database credentials
private authentication information
```

---

# 6. AI Output

The AI must return only structured JSON.

Expected structure:

```json
{
  "type": "fire",
  "severity": "critical",
  "priority": "P1",
  "confidence": 0.94,
  "summary": "A spreading fire has been reported with possible trapped civilians.",
  "recommendedActions": [
    "Dispatch fire response resources",
    "Check for trapped civilians",
    "Prepare medical support"
  ]
}
```

Do not depend on free-form AI responses.

---

# 7. Allowed Emergency Types

The AI must return only one of:

```text
fire
flood
medical
accident
industrial
structural
other
```

If Gemini returns an unsupported value:

```text
type = other
```

or use the fallback classifier.

---

# 8. Severity Classification

Allowed values:

```text
low
medium
high
critical
```

Use these guidelines.

## Critical

Examples:

```text
explosion
people trapped
building collapse
multiple casualties
spreading major fire
mass casualty situation
immediate life-threatening emergency
```

## High

Examples:

```text
major fire
serious injury
heavy flooding
multiple vehicles involved
dangerous industrial incident
```

## Medium

Examples:

```text
minor accident
localized flooding
small fire
single non-critical injury
```

## Low

Examples:

```text
small incident
minor hazard
no reported injury
limited impact
```

The AI must not invent casualties or hazards that were not mentioned.

---

# 9. Priority Mapping

Default mapping:

```text
critical → P1
high     → P2
medium   → P3
low      → P4
```

The operator can manually override the priority.

Example:

```text
AI:
severity = high
priority = P2

Operator:
priority = P1
```

The operator's decision becomes the current incident priority.

---

# 10. Confidence

AI confidence must be a number:

```text
0.0 → 1.0
```

Example:

```text
0.91
```

Never accept:

```text
-0.4
1.2
91%
"high"
```

If Gemini does not provide a valid confidence value, use a conservative fallback value.

---

# 11. AI Summary

The summary should be:

* Short
* Factual
* Operator-friendly
* Based only on supplied information

Target:

```text
1–2 sentences
```

Example:

```text
Multiple reports indicate a spreading fire near a market with possible trapped civilians.
```

Avoid dramatic or speculative language.

Do not say:

```text
"Authorities have been alerted."
```

unless the application actually performed that action.

Do not say:

```text
"An ambulance is on the way."
```

unless a resource has actually been assigned and its status supports that statement.

---

# 12. Recommended Actions

AI may recommend actions such as:

```text
Dispatch fire response team
Request medical support
Establish traffic control
Check for trapped civilians
Evacuate nearby area
Assess structural stability
Monitor rising water level
```

Recommendations must be treated as advisory.

The operator decides whether to execute them.

---

# 13. Gemini Prompt

Use a system-style prompt similar to:

```text
You are an emergency operations classification assistant.

Analyze the provided emergency report.

Return ONLY valid JSON.

Allowed type values:
fire, flood, medical, accident, industrial, structural, other

Allowed severity values:
low, medium, high, critical

Allowed priority values:
P1, P2, P3, P4

Rules:
1. Use only information provided in the report.
2. Do not invent casualties, locations, resources, or actions already completed.
3. Critical means immediate or potentially life-threatening danger.
4. High means significant emergency requiring rapid response.
5. Medium means a localized emergency with limited immediate danger.
6. Low means a minor or limited incident.
7. Priority normally maps from severity:
   critical=P1
   high=P2
   medium=P3
   low=P4
8. Confidence must be between 0 and 1.
9. Summary must be concise and factual.
10. Recommended actions must be suggestions only.
11. Never claim that emergency services were contacted.
12. Never claim that resources were dispatched.

Return this exact structure:

{
  "type": "...",
  "severity": "...",
  "priority": "...",
  "confidence": 0.0,
  "summary": "...",
  "recommendedActions": []
}
```

Append the citizen report after the instructions.

---

# 14. Gemini Configuration

Use:

```text
GEMINI_API_KEY
```

from the server environment.

Never expose the key to React.

Do not put:

```text
VITE_GEMINI_API_KEY
```

in the frontend.

The request flow must be:

```text
React
 ↓
Express API
 ↓
AI service
 ↓
Gemini
```

Never:

```text
React
 ↓
Gemini
```

---

# 15. AI API Failure

Gemini failure must not break incident creation.

Possible failures:

```text
missing API key
timeout
rate limit
invalid response
malformed JSON
network error
service unavailable
```

In all these cases:

```text
Gemini
  ↓
failure
  ↓
Rule-based fallback
  ↓
Valid classification
```

The incident should still be created.

---

# 16. Rule-Based Fallback

Create:

```text
server/src/services/classification.service.js
```

or a helper inside the AI/classification service.

Use deterministic keyword matching.

---

# 17. Fire Keywords

If description contains terms such as:

```text
fire
smoke
burning
flames
blaze
burning building
```

classify as:

```text
fire
```

---

# 18. Flood Keywords

Examples:

```text
flood
flooding
water level
overflow
waterlogging
submerged
```

classify as:

```text
flood
```

---

# 19. Medical Keywords

Examples:

```text
ambulance
injured
unconscious
bleeding
medical emergency
heart attack
```

classify as:

```text
medical
```

---

# 20. Accident Keywords

Examples:

```text
crash
collision
vehicle accident
road accident
car accident
bike accident
truck accident
```

classify as:

```text
accident
```

---

# 21. Industrial Keywords

Examples:

```text
chemical
factory
gas leak
industrial
toxic gas
plant explosion
```

classify as:

```text
industrial
```

---

# 22. Structural Keywords

Examples:

```text
building collapsed
collapse
collapsed building
structural damage
wall collapsed
```

classify as:

```text
structural
```

---

# 23. Fallback Default

If no useful keyword is detected:

```text
type = other
```

Default severity:

```text
medium
```

Priority:

```text
P3
```

The fallback should never pretend to have high confidence.

Example:

```json
{
  "type": "other",
  "severity": "medium",
  "priority": "P3",
  "confidence": 0.5,
  "summary": "Emergency report requires operator review.",
  "recommendedActions": [
    "Review the incident details",
    "Verify the reported location"
  ]
}
```

---

# 24. Fallback Severity Rules

The fallback classifier should detect critical keywords first.

Critical indicators:

```text
explosion
trapped
collapse
multiple casualties
people trapped
spreading fire
mass casualty
```

Then high indicators:

```text
major fire
serious injury
heavy flooding
gas leak
```

Then medium indicators:

```text
minor accident
localized flooding
small fire
```

Otherwise:

```text
low or medium
```

For ambiguous cases, prefer:

```text
medium
```

rather than inventing a critical emergency.

---

# 25. Fallback Priority

Use:

```text
critical → P1
high → P2
medium → P3
low → P4
```

---

# 26. AI Result Validation

Create a validation function.

It must verify:

```text
type is valid
severity is valid
priority is valid
confidence is between 0 and 1
summary is a string
recommendedActions is an array
```

If validation fails:

```text
Gemini result invalid
        ↓
Fallback classifier
```

Do not store malformed AI output.

---

# 27. AI Output Normalization

Normalize:

```text
"Fire" → "fire"
"CRITICAL" → "critical"
"p1" → "P1"
```

Trim whitespace.

Remove unexpected fields before storing the result.

Only store:

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

# 28. Duplicate Detection

Duplicate detection does not require a custom machine-learning model for the MVP.

Use:

```text
location similarity
+
time similarity
+
text similarity
```

Formula:

```text
duplicateScore =
(locationScore × 0.40)
+
(timeScore × 0.20)
+
(textScore × 0.40)
```

---

# 29. Location Similarity

Default radius:

```text
300 meters
```

Suggested scoring:

```text
same/very close location → high score
farther away → lower score
outside configured radius → 0
```

MongoDB `2dsphere` queries should identify nearby incidents.

---

# 30. Time Similarity

Default window:

```text
10 minutes
```

Suggested behavior:

```text
same minute → 1.0
few minutes apart → high score
near 10 minutes → low score
outside window → 0
```

---

# 31. Text Similarity

For the MVP, use a lightweight approach.

Possible implementation:

```text
lowercase text
remove punctuation
remove common stop words
compare important words
calculate overlap/Jaccard similarity
```

Example:

```text
Report A:
"Fire and smoke near the market"

Report B:
"Smoke and flames reported near market"
```

These should receive a relatively high text similarity score.

No vector database is required.

No custom NLP model is required.

---

# 32. Duplicate Threshold

If:

```text
duplicateScore >= 0.75
```

mark as:

```text
DUPLICATE_CANDIDATE
```

or create a duplicate candidate record.

Do not automatically merge.

The operator must choose:

```text
Confirm Duplicate
```

or:

```text
Reject Duplicate
```

---

# 33. Duplicate UI Information

The operator should see:

```text
Possible duplicate detected

Current Incident:
INC-10023

Possible Match:
INC-10019

Duplicate Score:
86%

Location:
120m apart

Time:
4 minutes apart

Text Similarity:
78%
```

Buttons:

```text
Confirm & Merge
Reject
```

---

# 34. AI Resource Recommendations

AI should not invent resource IDs.

Resource recommendation is primarily handled by the backend resource engine.

Use:

```text
capability matching
+
availability
+
distance
```

AI can optionally explain why a resource type is useful.

Example:

```text
Recommended:
Fire Response Team

Reason:
The incident is classified as a critical fire with possible trapped civilians.
```

The actual resource must come from the MongoDB resource collection.

---

# 35. Resource Recommendation Safety

Never allow AI to return:

```text
FT-99
AMB-999
UNKNOWN-RESOURCE
```

unless that resource actually exists.

The backend must select resources.

AI only provides contextual reasoning.

---

# 36. AI Incident Summary

The operator dashboard should display:

```text
AI Summary
```

Example:

```text
Multiple citizen reports indicate a spreading fire near a market. Possible civilian entrapment has been reported.
```

Display a small indicator:

```text
AI-generated
```

or:

```text
Rule-based classification
```

depending on the provider.

---

# 37. Operator Override

Operators must be able to change:

```text
type
severity
priority
```

Example:

```text
AI:
fire
critical
P1

Operator:
fire
high
P2
```

The database must store the updated values.

Create a timeline event:

```text
operator_override
```

Example:

```json
{
  "event": "operator_override",
  "message": "Operator changed priority from P1 to P2",
  "performedBy": "operatorId",
  "timestamp": "date"
}
```

---

# 38. AI Transparency

The UI must clearly distinguish:

```text
AI-generated
Rule-based
Operator override
```

Do not make AI recommendations appear as confirmed facts.

Use labels such as:

```text
AI Classification
AI Confidence
AI Summary
Recommended Actions
```

---

# 39. AI Loading State

When classification is running:

```text
Analyzing emergency report...
```

The UI must not freeze.

Show a loading state.

If AI takes too long, the backend should use a timeout and fall back.

Target AI response time:

```text
< 15 seconds
```

Normal expected response:

```text
a few seconds
```

---

# 40. AI Timeout

Configure a reasonable request timeout.

If Gemini does not respond within the configured limit:

```text
timeout
   ↓
fallback classifier
```

Do not leave the incident permanently stuck in:

```text
CLASSIFYING
```

---

# 41. AI Logging

Log:

```text
provider
success/failure
latency
fallback used
incident ID
```

Do not log:

```text
GEMINI_API_KEY
JWT
password
MongoDB URI
```

Avoid logging unnecessary personal information from citizen reports.

---

# 42. AI Analytics

Record analytics events such as:

```text
ai_classification_success
ai_classification_fallback
ai_classification_failed
operator_ai_override
duplicate_detected
duplicate_confirmed
duplicate_rejected
```

This can later be shown in the analytics dashboard.

---

# 43. Demo Scenario

The primary AI demonstration should be a fire scenario.

Example citizen report:

```text
"There is heavy smoke and a large fire near the market. Flames are spreading and two people may be trapped inside."
```

Expected classification:

```text
type:
fire

severity:
critical

priority:
P1
```

Example AI summary:

```text
A spreading fire has been reported with possible trapped civilians.
```

Recommended actions:

```text
Dispatch fire response team
Request medical support
Check for trapped civilians
```

---

# 44. Multiple Report Scenario

Report 1:

```text
"Large fire near the synthetic market with heavy smoke."
```

Report 2:

```text
"Smoke and flames are coming from the market area."
```

Report 3:

```text
"Fire spreading near the market, possible people trapped."
```

The system should:

```text
Report 1
   ↓
Create incident

Report 2
   ↓
Find nearby incident
   ↓
Duplicate candidate

Report 3
   ↓
Find nearby incident
   ↓
Duplicate candidate
```

The operator can merge the reports into the primary incident.

---

# 45. AI Failure Demo

The application should also work when:

```text
GEMINI_API_KEY
```

is missing.

Example:

```text
Gemini unavailable
       ↓
Rule classifier
       ↓
fire
critical
P1
```

The dashboard should still work.

This is important because the hackathon demo must not depend entirely on an external AI service.

---

# 46. AI Service Files

Recommended structure:

```text
server/src/services/
├── ai.service.js
├── classification.service.js
├── duplicate.service.js
└── resource.service.js
```

AI-specific helper if required:

```text
server/src/utils/aiValidator.js
```

Keep the architecture simple.

Do not create a separate AI microservice.

---

# 47. No Custom ML Requirement

Do NOT build:

```text
custom neural network
custom training pipeline
large NLP model
computer vision model
vector database
RAG pipeline
GPU infrastructure
```

These are outside the hackathon MVP.

The intelligent behavior should come from:

```text
Gemini API
+
rule-based fallback
+
deterministic duplicate detection
+
resource scoring
```

---

# 48. Future AI Features

These are future enhancements and should NOT block MVP development:

```text
multilingual emergency classification
voice-to-incident
image-based fire detection
computer vision
LLM-powered incident clustering
predictive resource demand
traffic-aware ETA
historical hotspot prediction
automated incident summarization across many reports
```

---

# 49. AI Security

Never expose:

```text
GEMINI_API_KEY
```

to the frontend.

Validate user input before sending it to Gemini.

Limit report length.

Recommended maximum description:

```text
2000 characters
```

Sanitize user-generated content before storing/displaying it.

Use backend rate limiting on incident submission.

---

# 50. AI Implementation Order

Implement in this order:

```text
1. Rule-based classifier
2. AI result schema/validation
3. Gemini service
4. Gemini timeout/fallback
5. Incident classification integration
6. Duplicate detection
7. Resource recommendation integration
8. Operator override
9. Socket.IO AI update
10. AI analytics events
```

Build the fallback first.

This ensures the application works even without an AI API key.

---

# 51. AI Acceptance Criteria

The AI implementation is complete when:

* [ ] Emergency descriptions can be classified.
* [ ] Fire reports classify as fire.
* [ ] Flood reports classify as flood.
* [ ] Medical reports classify as medical.
* [ ] Accident reports classify as accident.
* [ ] Industrial reports classify as industrial.
* [ ] Structural reports classify as structural.
* [ ] Unknown reports classify as other.
* [ ] Severity is generated.
* [ ] Priority is generated.
* [ ] Confidence is between 0 and 1.
* [ ] AI summary is generated.
* [ ] Recommended actions are generated.
* [ ] Gemini JSON is validated.
* [ ] Invalid Gemini output triggers fallback.
* [ ] Gemini timeout triggers fallback.
* [ ] Missing Gemini API key triggers fallback.
* [ ] AI never invents resource IDs.
* [ ] AI never claims resources were dispatched.
* [ ] AI never automatically merges incidents.
* [ ] AI never automatically resolves incidents.
* [ ] Operators can override AI classification.
* [ ] Duplicate candidates are detected using location/time/text.
* [ ] Duplicate candidates require operator confirmation.
* [ ] Resource recommendations come from actual database resources.
* [ ] AI status is visible in the UI.
* [ ] AI failures do not prevent incident creation.
* [ ] AI events can be recorded for analytics.

---

# 52. Final AI Principle

The PS-9 AI system should follow:

```text
AI assists.
Backend validates.
Operator decides.
Database records.
Socket.IO communicates.
```

The goal is not to build the world's most advanced AI emergency system.

The goal is to demonstrate a reliable, explainable AI-assisted emergency coordination workflow within the hackathon MVP.
