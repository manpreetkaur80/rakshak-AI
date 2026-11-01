# PS-9 — Intelligent Emergency Response & Resource Coordination Platform

Node.js + Express + MongoDB (Mongoose) + Socket.IO backend, React (Vite) + Leaflet client.

## Run locally
```bash
# 1. Backend
cd server
cp .env.example .env        # set MONGODB_URI and a JWT_SECRET (16+ chars); GEMINI_API_KEY is optional
npm install
npm run seed                # demo users, units, incidents
npm run dev                 # http://localhost:5000

# 2. Client (new terminal)
cd client && npm install && npm run dev    # http://localhost:5173
```
Demo logins (after seeding): `admin@ps9demo.com / admin123`, `operator@ps9demo.com / operator123`,
`responder1@ps9demo.com / responder123`, `citizen@ps9demo.com / citizen123`.
Admin → "Market Fire Demo Simulation" plays the full story in ~90 seconds.

## Tests
```bash
cd server
npm run test:unit   # no database needed
npm test            # unit + integration (needs MongoDB; set MONGODB_URI_TEST to override mongodb://127.0.0.1:27017/ps9_integration_test — this DB is DROPPED by the tests)
```

## How it works
- **Reports** (anonymous or signed in) → rule engine / Gemini classifies type, severity, priority → duplicate check
  (distance + time + synonym-aware text similarity, thresholds editable by admins) → operator confirms merge/split.
- **Dispatch**: role-based recommendation package (lead unit + ambulance + police …) with ETA and reasons; units are claimed atomically so a busy unit cannot be double-booked.
- **Responders** see incidents assigned to their units, accept, go en route / on scene, resolve (units are freed automatically).
- **Escalation** (cron, every minute): unassigned P1/P2 → warning → critical; assigned but not on scene → delay alert. Thresholds live-editable in Admin.
- **Moving units**: when a unit goes EN_ROUTE it drives to the incident on the live map (`resource:route` + `resource:location` socket events, road route via OSRM with straight-line fallback), and drives back to base once released.
- **Realtime**: staff sockets get full events; public/tracking sockets only get `{publicId,status}`.
- Without `GEMINI_API_KEY` everything still works using the rule-based classifier and template summaries.

## Not implemented (out of MVP scope per PRD §6)
SMS/e-mail/push delivery, Kafka/Redis, OSRM routing (ETA is straight-line distance at 40 km/h), image/voice AI analysis, hospital bed sync, PDF reports.

## Multi-source ingestion, notifications, analytics (added)

**Ingestion** – `POST /api/v1/ingest/{sensor|call|hospital|govt|field}` with header `x-api-key: $INGEST_API_KEY`
(or a staff login). Sensor readings below threshold return 202 (ignored); `eventId` makes retries idempotent;
repeat alarms from one sensor attach to the same incident. All sources go through the same classifier and
duplicate detection, so a call + app report + sensor about one fire merge into one incident ("N reports from M sources").
Admin → *Data Sources* has simulators and a **Multi-source fire scenario**.

**Notifications** – in-app (live bell via socket `notification:new`), e-mail (SendGrid) and SMS (Twilio), routed by role
(P1 → operators/admins, dispatch → the responder, casualties → hospitals, resolved → reporter). 3 attempts with back-off,
delivery status in Admin → *Notification Delivery Log*. Without `SENDGRID_API_KEY` / `TWILIO_*` the "console" provider
simulates sending. Users set channels/phone at *Notification settings*.

**Analytics** – date range (`?from&to`), shortage forecast (`/analytics/shortages`), CSV export (`/analytics/export`).
Missing unit types for an incident raise a deduped `resource_shortage` alert.

## Fake-report screening, auto-dispatch, PDF report (added)

- **Credibility** – every report gets a 0–1 score with flags (test/prank wording, gibberish, flooding from one account, very short text).
  Machine/staff feeds are trusted; merging corroborating reports raises the score. Low-credibility P1 reports raise a *warning* instead of a P1 alarm,
  skip hospital notifications and are never auto-dispatched. Operators see the score and can use **False report** (`POST /incidents/:id/dismiss`).
  Citizens never see it.
- **Auto-dispatch** – `POST /incidents/:id/auto-dispatch` sends the whole recommended package in one click. Admin → Settings can switch on
  automatic dispatch for P1 (or P1–P3) incidents (also `AUTO_DISPATCH=true` in `.env`). `POST /incidents/:id/recall` takes the units back.
- **PDF report** – `GET /incidents/:id/report` (operator/admin): overview, response times, units, sources, full timeline, resolution.

## Mobile & deployment

The UI is responsive: on phones/tablets the sidebar becomes a slide-in menu with a top bar, multi-column pages stack,
tables scroll sideways, and the report page shows the form above the map.

**Deploy (example: backend on Render/Railway, frontend on Vercel/Netlify, database on MongoDB Atlas)**
1. Backend: root `server/`, start command `npm start`, env vars from `server/.env.example`
   (`MONGODB_URI`, a long random `JWT_SECRET`, `NODE_ENV=production`, `CLIENT_URL=https://<your-frontend-domain>`, optional `GEMINI_API_KEY`, `INGEST_API_KEY`, SendGrid/Twilio keys).
   Run `npm run seed` once against the production DB for demo data (or skip it and create users from the Admin page).
2. Frontend: root `client/`, build `npm run build`, output `dist`, env var `VITE_API_URL=https://<your-backend-domain>`.
   Add a rewrite of all paths to `/index.html` (single-page app).
3. Atlas: allow the backend host's IP (or 0.0.0.0/0) in Network Access.
4. Never commit `.env`; rotate any password that was ever shared or committed.
